const express = require('express');
const prisma = require('../lib/prisma');
const { requireLogin, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);
router.use(adminOnly);

// GET all Gemini keys
router.get('/', async (req, res, next) => {
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
router.post('/', async (req, res, next) => {
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
router.delete('/:id', async (req, res, next) => {
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

module.exports = router;