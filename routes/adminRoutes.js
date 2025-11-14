const express = require('express');
const { PrismaClient } = require('@prisma/client');
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
router.get('/users', async (req, res) => {
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
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users/:id
 * Fetches detailed information for a single user,
 * including their keys, subscriptions, and usage summary.
 */
router.get('/users/:id', async (req, res) => {
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
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Manually changes a user's account status (e.g., suspend or activate).
 */
router.patch('/users/:id/status', async (req, res) => {
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
    res.status(500).json({ message: 'Failed to update user status.' });
  }
});

module.exports = router;