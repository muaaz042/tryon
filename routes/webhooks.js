const express = require('express');
const Stripe = require('stripe'); // npm install stripe

const router = express.Router();
const prisma = require('../lib/prisma');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /webhooks/rapidapi
 * Listens for subscription events from RapidAPI.
 * This is how we sync our database with their billing.
 *
 * RapidAPI sends user/plan info in HEADERS, not the body.
 * Key Headers:
 * 'X-RapidAPI-User': The user's ID on RapidAPI.
 * 'X-RapidAPI-Subscription': The name of the plan (e.g., "BASIC", "PRO").
 * 'X-RapidAPI-Event': The event type (e.g., "subscribe", "unsubscribe").
 */
router.post('/rapidapi', express.json(), async (req, res) => {
  const rapidApiKey = req.headers['x-rapidapi-proxy-secret'];
  const event = req.headers['x-rapidapi-event'];
  const userId = req.headers['x-rapidapi-user'];
  const planName = req.headers['x-rapidapi-subscription'];

  try {
    // 1. --- SECURITY CHECK ---
    // Verify the secret. This ensures the request is from RapidAPI.
    // Set this secret in your .env file and in the RapidAPI dashboard.
    if (rapidApiKey !== process.env.RAPIDAPI_SECRET) {
      console.warn('Invalid RapidAPI webhook secret received.');
      return res.status(401).send('Unauthorized');
    }

    // 2. --- Find the corresponding plan in our DB ---
    // We match the 'planName' (e.g., "PRO") to our 'planProviderId'
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { planProviderId: planName },
    });

    if (!plan) {
      // This is bad. It means our DB is out of sync with RapidAPI.
      console.error(`Webhook Error: Plan not found: ${planName}`);
      // Send 500 so RapidAPI retries, giving us time to fix it.

      next(error);
    }

    // 3. --- Find the user ---
    // We assume the 'X-RapidAPI-User' ID is stored as 'customerId'
    let user = await prisma.user.findFirst({
      where: { customerId: userId },
    });

    if (!user) {
      // This user has paid on RapidAPI but never logged into our dashboard.
      // We must create a "stub" account for them.
      console.log(`New user from RapidAPI: ${userId}. Creating stub account.`);
      user = await prisma.user.create({
        data: {
          // Create a fake email/username. They can change it if they log in.
          email: `${userId}@rapidapi.user`,
          username: `${userId}_rapidapi`,
          password: '---not_set---', // They can't log in
          customerId: userId, // The most important field
          accountStatus: 'active',
        },
      });
    }
    
    // 4. --- Handle the subscription event ---
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (event === 'subscribe' || event === 'update') {
      // Create or update their subscription
      const newSubscription = await prisma.userSubscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: 'active',
          // RapidAPI doesn't tell us the period, so we assume 30 days
          currentPeriodStart: new Date(),
          currentPeriodEnd: thirtyDaysFromNow,
        },
      });

      // Set this new subscription as the user's *current* one
      await prisma.user.update({
        where: { id: user.id },
        data: { currentSubscriptionId: newSubscription.id },
      });

      console.log(`User ${user.id} subscribed to ${plan.name} plan.`);
    } 
    else if (event === 'unsubscribe') {
      // Mark the user's current subscription as canceled
      await prisma.userSubscription.update({
        where: { id: user.currentSubscriptionId },
        data: {
          status: 'canceled',
          cancelAtPeriodEnd: true,
        },
      });

      // You might also want to nullify their 'currentSubscriptionId'
      await prisma.user.update({
        where: { id: user.id },
        data: { currentSubscriptionId: null }
      });
      
      console.log(`User ${user.id} unsubscribed from plan.`);
    }

    // 5. --- Send success response ---
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);

    next(error);
  }
});

// --- 👇 ADD THIS NEW STRIPE WEBHOOK ---

/**
 * POST /webhooks/stripe
 * Listens for subscription events from Stripe.
 */
// Use express.raw for this specific route to verify the signature
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // 1. Verify the event is from Stripe
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.warn(`Stripe webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 2. Handle the event
  try {
    switch (event.type) {
      
      // --- Case 1: A user just finished paying for the first time ---
      case 'checkout.session.completed':
        const session = event.data.object;

        // Get the user ID you passed in when creating the checkout session
        const userId = parseInt(session.client_reference_id, 10);
        if (!userId) {
          console.error('Webhook Error: checkout.session.completed has no client_reference_id (userId)');
          break;
        }

        // Get the subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items.data[0].price.id; // Stripe's plan ID

        // Find your internal plan
        const plan = await prisma.subscriptionPlan.findUnique({
          where: { planProviderId: priceId }
        });
        if (!plan) {
          console.error(`Webhook Error: Plan not found for Stripe priceId: ${priceId}`);
          break;
        }
        
        // Create the new subscription in your DB
        const newSubscription = await prisma.userSubscription.create({
          data: {
            userId: userId,
            planId: plan.id,
            status: subscription.status, // e.g., 'active'
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          }
        });

        // Link the subscription and Stripe's customer ID to the user
        await prisma.user.update({
          where: { id: userId },
          data: {
            currentSubscriptionId: newSubscription.id,
            customerId: session.customer, // Save Stripe's customer ID
            accountStatus: 'active'
          }
        });
        console.log(`Stripe subscription created for user ${userId}`);
        break;
      
      // --- Case 2: Stripe renewed, canceled, or failed a payment ---
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subUpdate = event.data.object;
        const subStatus = subUpdate.status; // e.g., 'active', 'past_due', 'canceled'

        // Find the subscription in your DB and update its status
        const updatedSub = await prisma.userSubscription.update({
          where: { id: subUpdate.id }, // Assumes you store Stripe sub ID
          // OR: Find by customerId and update their currentSubscription
          data: {
            status: subStatus,
            currentPeriodStart: new Date(subUpdate.current_period_start * 1000),
            currentPeriodEnd: new Date(subUpdate.current_period_end * 1000),
            cancelAtPeriodEnd: subUpdate.cancel_at_period_end,
          }
        });

        // If canceled, remove it as the user's current plan
        if(subStatus === 'canceled' || subStatus === 'unpaid') {
           await prisma.user.update({
              where: { customerId: subUpdate.customer },
              data: { currentSubscriptionId: null }
           });
        }
        console.log(`Stripe subscription ${updatedSub.id} status updated to ${subStatus}`);
        break;

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    // 3. Send success response to Stripe
    res.json({ received: true });

  } catch (error) {
    console.error('Stripe webhook processing error:', error);

    next(error);  
  }
});


module.exports = router;