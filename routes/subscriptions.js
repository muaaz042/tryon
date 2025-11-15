const express = require('express');
const prisma = require('../lib/prisma');
const { requireLogin, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);
router.use(adminOnly);

// GET all subscription plans
router.get('/', async (req, res, next) => {
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
router.post('/', async (req, res, next) => {
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
router.patch('/:id', async (req, res, next) => {
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