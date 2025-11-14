// index.js (or app.js)
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { apiAuthMiddleware } = require('./middleware/apiAuth'); 
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
const apiKeyRoutes = require('./routes/apiKeys');
const accountRoutes = require('./routes/account');
const webhookRoutes = require('./routes/webhooks'); // <-- ADD THIS
 // <-- ADD THIS
const apiV1Router = express.Router();
apiV1Router.use(apiAuthMiddleware); 
// Use your routes
app.use('/auth', authRoutes);     // e.g., /auth/register, /auth/login
app.use('/api/user', usersRoute);
app.use('/api/admin', adminRoute);
app.use('/api/keys', apiKeyRoutes); 
app.use('/v1', apiV1Router);
app.use('/api/account', accountRoutes);
app.use('/webhooks', webhookRoutes);
// <-- ADD THIS (e.g., POST /api/keys)
// Simple health check route
app.get("/", (req, res) => {
  res.send("Virtual Try-On API Server is running.");
});


// ✅ Start server
const PORT = process.env.PORT || 5000; // Use port 5000 or 3000, just be consistent
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port: ${PORT}`);
});