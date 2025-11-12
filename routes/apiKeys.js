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

module.exports = router;