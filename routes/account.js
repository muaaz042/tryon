const express = require('express');
const { requireLogin } = require('../middleware/auth'); // Use JWT auth

const router = express.Router();
const prisma = require('../lib/prisma');
/**
 * GET /api/account/status
 * Fetches the logged-in user's account status,
 * current subscription, plan details, and usage.
 */
router.get('/status', requireLogin, async (req, res) => {
  try {
    // 1. Get the user and their subscription/plan details
    // req.user.id is available from the requireLogin middleware
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        accountStatus: true,
        createdAt: true,
        currentSubscription: {
          select: {
            id: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            plan: {
              select: {
                id: true,
                name: true,
                requestLimitMonthly: true,
                rateLimitPerMinute: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      // This should rarely happen if requireLogin is working
      return res.status(404).json({ message: 'User not found.' });
    }

    // 2. Get the user's current usage
    let usageCount = 0;
    if (user.currentSubscription && user.currentSubscription.status === 'active') {
      // Get usage ONLY for the current billing period
      usageCount = await prisma.apiUsageLog.count({
        where: {
          userId: user.id,
          requestTimestamp: {
            gte: user.currentSubscription.currentPeriodStart,
            lte: user.currentSubscription.currentPeriodEnd,
          },
        },
      });
    }

    // 3. Format a clean response
    const plan = user.currentSubscription?.plan;
    const subscription = user.currentSubscription;

    res.json({
      account: {
        userId: user.id,
        email: user.email,
        status: user.accountStatus,
        memberSince: user.createdAt,
      },
      subscription: {
        planName: plan?.name || 'No Plan',
        status: subscription?.status || 'inactive',
        periodStart: subscription?.currentPeriodStart || null,
        periodEnd: subscription?.currentPeriodEnd || null,
      },
      usage: {
        requestsUsed: usageCount,
        requestLimit: plan?.requestLimitMonthly || 0,
        requestsRemaining: (plan?.requestLimitMonthly || 0) - usageCount,
      },
    });

  } catch (error) {
    console.error('Error fetching account status:', error);
    res.status(500).json({ message: 'Internal server error' });
    next(error);
  }
});

module.exports = router;