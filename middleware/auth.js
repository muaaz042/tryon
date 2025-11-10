const jwt = require('jsonwebtoken');
const db = require('../db/db');

exports.requireLogin = async (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = req.headers.authorization.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let table;
    if (decoded.role === "admin") {
      table = "admins";
    } else if (decoded.role === "user") {
      table = "users";
    } else {
      return res.status(401).json({ error: "Invalid role in token" });
    }

    const [results] = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [decoded.id]);

    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid token - user not found' });
    }

    req.user = results[0]; // Attach user or admin data
    req.user.role = decoded.role; // Ensure role is also attached
    next();

  } catch (error) {
    console.error('❌ Token verification error:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
