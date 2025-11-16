// index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { z } = require('zod');
const { startScheduler } = require('./lib/scheduler');

dotenv.config();
const app = express();

// Define this constant so the error handler can use it
const MAX_FILE_SIZE_MB = 2;

// --- Core Middlewares ---
app.use(helmet()); // Adds security headers
app.use(express.static('public')); // Serves your index.html

// Per your request, using open CORS.
// For production, you should restrict this:
// const corsOptions = { origin: process.env.CORS_ORIGIN };
// app.use(cors(corsOptions));
app.use(cors());

// --- Webhook Routes (Must come BEFORE express.json()) ---
// Stripe requires the raw body to verify signatures.
const webhookRoutes = require('./routes/webhooks');
app.use('/webhooks', webhookRoutes);

// --- General Middlewares ---
app.use(express.json()); // Middleware to parse JSON bodies for all other routes

// --- Rate Limiter Definitions ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // Limit each IP to 10 auth attempts per window
  message: 'Too many login/register attempts, please try again later.',
});

// --- API & Dashboard Routes ---
const authRoutes = require('./routes/auth');
const adminRoute = require('./routes/adminRoutes');
const apiKeyRoutes = require('./routes/apiKeys');
const accountRoutes = require('./routes/account');
const productRoutes = require('./routes/product'); // Your new product routes

// --- Apply Routes & Limiters ---
app.use('/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoute);      // Auth is handled *inside* adminRoutes
app.use('/api/keys', apiKeyRoutes);      // Auth is handled *inside* apiKeyRoutes
app.use('/api/account', accountRoutes);  // Auth is handled *inside* accountRoutes
app.use('/v1', apiLimiter, productRoutes); // Your product API (e.g., /v1/try-on)

// --- Health Check Route ---
app.get("/", (req, res) => {
  res.redirect('/v1/health'); // Redirect root to product health check
});

// --- Central Error Handler (Must be last) ---
app.use((err, req, res, next) => {
  console.error(err.stack); // Log the full error
  
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: err.flatten().fieldErrors, // Correct Zod error formatting
    });
  }
  
  // Handle file too large error from Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`
    });
  }
  
  console.error('Error fetching data:', err);
  // 2. You send a generic 500 response here

  next(err);

});

// --- Start Server & Scheduler ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port: ${PORT}`);
  startScheduler(); // Start the daily API key reset job
});