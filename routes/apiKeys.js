const express = require('express');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto'); // Built-in Node.js module
const { requireLogin } = require('../middleware/auth'); // Import auth middleware
const { createApiKeySchema } = require('../validation'); // Import new schema
const { z } = require('zod');

const router = express.Router();
const prisma = new new PrismaClient();

/**
 * Helper function to generate a secure API key
 */
function generateApiKey() {
  const key = crypto.randomBytes(32).toString('hex');
  const prefix = 'vto_live_'; // Virtual Try-On, Live key
  return prefix + key;
}

/**
 * Helper function to hash an API key
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * POST /api/keys
 * Creates a new API key for the currently logged-in user.
 * This route is protected and requires a valid JWT.
 */
router.post('/', requireLogin, async (req, res) => {
  // 'requireLogin' has already run, so req.user is available
  
  try {
    // 1. Validate request body
    const { name } = createApiKeySchema.parse(req.body);

    // 2. Generate a new API key
    const newApiKey = generateApiKey();
    const hashedKey = hashApiKey(newApiKey);
    const prefix = newApiKey.substring(0, newApiKey.indexOf('_', 4) + 1); // e.g., "vto_live_"

    // 3. Save the *hashed* key to the database
    const savedKey = await prisma.apiKey.create({
      data: {
        name: name,
        keyPrefix: prefix,
        keyHash: hashedKey,
        userId: req.user.id, // req.user.id comes from the requireLogin middleware
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true
      }
    });

    // 4. Send the *un-hashed* key back to the user
    // THIS IS THE ONLY TIME THEY WILL EVER SEE IT.
    res.status(201).json({
      message: 'API key created successfully. Store this key securely!',
      apiKey: newApiKey, // The full, un-hashed key
      keyDetails: savedKey // The metadata saved in the DB
    });

  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: error.flatten().fieldErrors 
      });
    }
    
    // Handle potential duplicate key errors (highly unlikely)
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        message: 'A key with this prefix already exists. Please try again.'
      });
    }

    console.error('Error creating API key:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/keys
 * Lists all API keys for the currently logged-in user.
 */
router.get('/', requireLogin, async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: {
        userId: req.user.id,
      },
      // IMPORTANT: Only select safe fields.
      // NEVER send the keyHash back to the client.
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(keys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// --- 👇 ADD THIS NEW ROUTE ---

/**
 * DELETE /api/keys/:id
 * Revokes (soft-deletes) an API key.
 */
router.delete('/:id', requireLogin, async (req, res) => {
  try {
    const keyId = parseInt(req.params.id);

    // Check if keyId is a valid number
    if (isNaN(keyId)) {
      return res.status(400).json({ message: 'Invalid key ID.' });
    }

    // Use updateMany to ensure the user can only "delete" their own keys.
    // This is more secure than finding then deleting.
    const updateResult = await prisma.apiKey.updateMany({
      where: {
        id: keyId,
        userId: req.user.id, // User can only update their OWN keys
      },
      data: {
        status: 'revoked', // We set a status, not a hard delete
      },
    });

    // updateMany returns a 'count' of records affected.
    // If count is 0, it means no key was found *or* the user didn't own it.
    if (updateResult.count === 0) {
      return res.status(404).json({
        message: 'API key not found or you do not have permission to revoke it.',
      });
    }

    res.status(200).json({ message: 'API key revoked successfully.' });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;