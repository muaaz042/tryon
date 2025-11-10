const express = require('express');
const router = express.Router();
const db = require('../db/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { requireLogin } = require('../middleware/auth');

// -------------------- Register a new user --------------------
router.post('/register', async (req, res) => {
  const { name, username, email, password } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check email & username
    const [emailRes] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (emailRes.length > 0) return res.status(409).json({ message: 'Email already exists' });

    const [usernameRes] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (usernameRes.length > 0) return res.status(409).json({ message: 'Username already taken' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user with role = 'user'
    await db.query('INSERT INTO users (name, username, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [name, username, email, hashedPassword, 'user']);

    res.status(201).json({ message: 'User registered successfully' });

  } catch (err) {
    console.error('❌ Register error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Login --------------------
router.post('/login', async (req, res) => {
  const { email, username, password } = req.body;

  if ((!email && !username) || !password) return res.status(400).json({ message: 'Email/Username and Password are required' });

  try {
    const sql = email ? 'SELECT * FROM users WHERE email = ?' : 'SELECT * FROM users WHERE username = ?';
    const [results] = await db.query(sql, [email || username]);

    if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ message: 'Login successful', token });

  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Get Own Profile --------------------
router.get('/profile', requireLogin, async (req, res) => {
  try {
    const [results] = await db.query('SELECT id, name, username, email, authorized FROM users WHERE id = ?', [req.user.id]);
    if (results.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(results[0]);
  } catch (err) {
    console.error('❌ Profile error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Update Own Info --------------------
router.patch('/update', requireLogin, async (req, res) => {
  const { name, username, email } = req.body;
  const userId = req.user.id;

  try {
    const [results] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (results.length === 0) return res.status(404).json({ message: 'User not found' });

    const current = results[0];
    const newName = name || current.name;
    const newUsername = username || current.username;
    const newEmail = email || current.email;

    // Check conflicts
    if (username && username !== current.username) {
      const [uConflict] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId]);
      if (uConflict.length > 0) return res.status(409).json({ message: 'Username already taken' });
    }

    if (email && email !== current.email) {
      const [eConflict] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (eConflict.length > 0) return res.status(409).json({ message: 'Email already in use' });
    }

    await db.query('UPDATE users SET name = ?, username = ?, email = ? WHERE id = ?',
      [newName, newUsername, newEmail, userId]);
    res.json({ message: 'User updated successfully' });

  } catch (err) {
    console.error('❌ Update error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Change Own Password --------------------
router.patch('/change-password', requireLogin, async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  const userId = req.user.id;

  if (!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ message: 'All password fields are required' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'New passwords do not match' });

  try {
    const [results] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const user = results[0];
    const match = await bcrypt.compare(oldPassword, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid old password' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ message: 'Password updated successfully' });

  } catch (err) {
    console.error('❌ Change password error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// -------------------- Delete Own Account --------------------
router.delete('/delete', requireLogin, async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('❌ Delete error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
