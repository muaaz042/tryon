const express = require('express');
const { requireLogin, adminOnly } = require('../middleware/auth');

const router = express.Router();
const prisma = require('../lib/prisma');

// --- IMPORTANT ---
// This applies admin-only authentication to EVERY route in this file.
// An admin must be logged in to use any of these endpoints.
router.use(requireLogin);
router.use(adminOnly);

/**
 * GET /api/admin/users
 * Fetches a list of all users on the platform.
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        accountStatus: true,
        createdAt: true,
        customerId: true, // See their Stripe/RapidAPI ID
        currentSubscription: {
          select: {
            status: true,
            plan: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(users);
  } catch (error) {
    console.error('Admin error fetching users:', error);

    next(error);
  }
});

/**
 * GET /api/admin/users/:id
 * Fetches detailed information for a single user,
 * including their keys, subscriptions, and usage summary.
 */
router.get('/users/:id', async (req, res, next) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        // --- Profile ---
        id: true,
        name: true,
        email: true,
        username: true,
        accountStatus: true,
        customerId: true,
        createdAt: true,
        
        // --- Keys ---
        apiKeys: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            status: true,
            lastUsedAt: true,
            createdAt: true,
          },
        },
        
        // --- Subscription History ---
        subscriptions: {
          select: {
            id: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            plan: {
              select: { name: true, priceCents: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        
        // --- Usage Stats ---
        _count: {
          select: {
            usageLogs: true, // Total lifetime API calls
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json(user);
  } catch (error) {
    console.error(`Admin error fetching user ${userId}:`, error);

    next(error);
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Manually changes a user's account status (e.g., suspend or activate).
 */
router.patch('/users/:id/status', async (req, res, next) => {
  const userId = parseInt(req.params.id);
  const { status } = req.body; // e.g., "active", "suspended"

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  // Validate the status
  if (!['active', 'suspended', 'pending_verification'].includes(status)) {
    return res.status(400).json({ 
      error: 'Invalid status. Must be "active", "suspended", or "pending_verification".' 
    });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        accountStatus: status,
      },
      select: {
        id: true,
        email: true,
        accountStatus: true,
      },
    });
    
    res.json({ message: 'User status updated.', user: updatedUser });
  } catch (error) {
    if (error.code === 'P2025') { // Prisma's "record not found"
      return res.status(404).json({ message: 'User not found.' });
    }
    console.error(`Admin error updating status for user ${userId}:`, error);
 
    next(error);
  }
});

// GET all Gemini keys
router.get('/product-api', async (req, res, next) => {
  try {
    const keys = await prisma.geminiApiKey.findMany({
      select: {
        id: true,
        key: true, // Show the key in admin dashboard
        requestCount: true,
        isRateLimited: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    // Obfuscate keys for safety
    const safeKeys = keys.map(k => ({
      ...k,
      key: `${k.key.substring(0, 4)}...${k.key.substring(k.key.length - 4)}`
    }));
    res.json(safeKeys);
  } catch (error) {
    next(error);
  }
});

// POST a new Gemini key
router.post('/product-api', async (req, res, next) => {
  try {
    const { key } = req.body;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ message: 'A valid "key" string is required.' });
    }
    
    const newKey = await prisma.geminiApiKey.create({
      data: { key: key },
    });
    res.status(201).json({ message: 'Gemini key added.', id: newKey.id });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'This key is already in the database.' });
    }
    next(error);
  }
});

// DELETE a Gemini key
router.delete('/product-api/:id', async (req, res, next) => {
  try {
    const keyId = parseInt(req.params.id);
    if (isNaN(keyId)) {
      return res.status(400).json({ message: 'Invalid key ID.' });
    }
    
    await prisma.geminiApiKey.delete({
      where: { id: keyId },
    });
    res.status(200).json({ message: 'Gemini key deleted.' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Key not found.' });
    }
    next(error);
  }
});

// GET all subscription plans
router.get('/subscription', async (req, res, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { priceCents: 'asc' },
    });
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

// POST a new subscription plan
router.post('/subscription', async (req, res, next) => {
  try {
    // Add Zod validation here if you want
    const { name, planProviderId, priceCents, billingCycle, requestLimitMonthly, rateLimitPerMinute, features, isPublic } = req.body;
    
    const newPlan = await prisma.subscriptionPlan.create({
      data: {
        name,
        planProviderId,
        priceCents,
        billingCycle,
        requestLimitMonthly,
        rateLimitPerMinute,
        features,
        isPublic,
      },
    });
    res.status(201).json(newPlan);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'A plan with this Provider ID already exists.' });
    }
    next(error);
  }
});

// PATCH an existing subscription plan
router.patch('/subscription/:id', async (req, res, next) => {
  try {
    const planId = parseInt(req.params.id);
    const { ...data } = req.body; // Update with any data sent

    const updatedPlan = await prisma.subscriptionPlan.update({
      where: { id: planId },
      data: data,
    });
    res.json(updatedPlan);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Plan not found.' });
    }
    next(error);
  }
});


module.exports = router;