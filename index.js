// index.js (or app.js)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

// ✅ Middleware
app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies


// ✅ Routes
// Import all your different route files
const authRoutes = require('./routes/auth'); // For login/register
const usersRoute = require('./routes/userRoutes'); // For user-specific API calls
const adminRoute = require('./routes/adminRoutes'); // For admin-specific API calls
const apiKeyRoutes = require('./routes/apiKeys'); // <-- ADD THIS
// Use your routes
app.use('/auth', authRoutes);     // e.g., /auth/register, /auth/login
app.use('/api/user', usersRoute);
app.use('/api/admin', adminRoute);
app.use('/api/keys', apiKeyRoutes); // <-- ADD THIS (e.g., POST /api/keys)
// Simple health check route
app.get("/", (req, res) => {
  res.send("Virtual Try-On API Server is running.");
});


// ✅ Start server
const PORT = process.env.PORT || 5000; // Use port 5000 or 3000, just be consistent
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port: ${PORT}`);
});