const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireLogin } = require('../middleware/auth');
const { adminOnly } = require('../middleware/admin');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


// -------------------- Admin Login --------------------
router.post('/login', async (req, res) => {
  const { email, username, password } = req.body;

  if ((!email && !username) || !password) {
    return res.status(400).json({ message: 'Email/Username and Password are required' });
  }

  try {
    // Fetch admin by email or username
    const sql = email
      ? 'SELECT * FROM admins WHERE email = ?'
      : 'SELECT * FROM admins WHERE username = ?';

    const [results] = await db.query(sql, [email || username]);

    if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const admin = results[0];

    // Compare password
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    // Generate JWT token (including role)
    const token = jwt.sign(
      { id: admin.id, name: admin.name, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ message: 'Admin login successful', token });

  } catch (err) {
    console.error('❌ Admin login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Get All Users --------------------
router.get('/users', requireLogin, adminOnly, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, name, username, email, authorized FROM users');
    res.json(users);
  } catch (err) {
    console.error('❌ Admin get users error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Get Single User --------------------
router.get('/user/:id', requireLogin, adminOnly, async (req, res) => {
  try {
    const [user] = await db.query('SELECT id, name, username, email, authorized FROM users WHERE id = ?', [req.params.id]);
    if (user.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(user[0]);
  } catch (err) {
    console.error('❌ Admin get user error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Update User --------------------
router.patch('/user/:id', requireLogin, adminOnly, async (req, res) => {
  const { name, username, email, authorized } = req.body;
  const userId = req.params.id;

  try {
    const [existing] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) return res.status(404).json({ message: 'User not found' });

    const current = existing[0];
    const newName = name || current.name;
    const newUsername = username || current.username;
    const newEmail = email || current.email;
    const newAuth = authorized !== undefined ? authorized : current.authorized;

    // Check conflicts
    if (username && username !== current.username) {
      const [conflictU] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
      if (conflictU.length > 0) return res.status(409).json({ message: 'Username already taken' });
    }
    if (email && email !== current.email) {
      const [conflictE] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (conflictE.length > 0) return res.status(409).json({ message: 'Email already in use' });
    }

    await db.query('UPDATE users SET name = ?, username = ?, email = ?, authorized = ? WHERE id = ?',
      [newName, newUsername, newEmail, newAuth, userId]);
    res.json({ message: 'User updated successfully' });

  } catch (err) {
    console.error('❌ Admin update user error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Delete User --------------------
router.delete('/user/:id', requireLogin, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('❌ Admin delete user error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
