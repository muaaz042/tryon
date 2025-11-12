// middleware/auth.js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Middleware to verify a JWT token.
 * This works for both regular Users and Admins.
 * It finds the user/admin in the DB and attaches them to req.user.
 */
exports.requireLogin = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = req.headers.authorization.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token missing' });
  }

  try {
    // 1. Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let userOrAdmin;

    // 2. Find the user/admin using Prisma based on the role in the token
    if (decoded.role === "admin") {
      userOrAdmin = await prisma.admin.findUnique({
        where: { id: decoded.id }
      });
    } else if (decoded.role === "user") {
      userOrAdmin = await prisma.user.findUnique({
        where: { id: decoded.id }
      });
    } else {
      return res.status(401).json({ error: "Invalid role in token" });
    }

    // 3. Check if user/admin exists
    if (!userOrAdmin) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }

    // 4. Attach the user data to the request object
    req.user = userOrAdmin;
    req.user.role = decoded.role; // Explicitly add the role from the token
    next();

  } catch (error) {
    console.error('❌ Token verification error:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware to ensure only an admin can access a route.
 * This should be used AFTER requireLogin.
 */
exports.adminOnly = (req, res, next) => {
  // This logic was already correct!
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: Admin access only' });
  }
  next();
};