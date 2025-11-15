const { PrismaClient } = require('@prisma/client');
const { hashApiKey } = require('../utils/crypto'); // Import our new utility

const prisma = require('../lib/prisma');

/**
 * This is the core middleware for your paid API.
 * 1. Validates the API key.
 * 2. Checks if the user's subscription is active.
 * 3. Checks if the user is within their monthly quota.
 * 4. Logs the API call to the `ApiUsageLog` table after it finishes.
 */
const apiAuthMiddleware = async (req, res, next) => {
  const startTime = Date.now();
  let apiKeyData = null;
  let userData = null;

  // This event listener runs AFTER the response is sent
  res.on('finish', async () => {
    try {
      // Only log if we successfully identified a user and key
      if (apiKeyData && userData) {
        const responseTimeMs = Date.now() - startTime;
        
        // This runs in the background. We don't 'await' it
        // because we don't want to slow down the response.
        prisma.apiUsageLog.create({
          data: {
            userId: userData.id,
            apiKeyId: apiKeyData.id,
            httpMethod: req.method,
            endpoint: req.originalUrl,
            httpStatusCode: res.statusCode, // This gets the FINAL status code
            responseTimeMs: responseTimeMs,
            creditsConsumed: 1, // You can make this dynamic later
          },
        }).catch(err => {
          // Log any errors from the logging itself
          console.error('Failed to create API usage log:', err);
        });
      }
    } catch (logError) {
      console.error('Error in API log "finish" event:', logError);
    }
  });

  // --- Main Authentication & Authorization Logic ---
  try {
    // 1. Get the API key from the header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Authorization header is missing or invalid. Use Bearer <api_key>.' 
      });
    }
    const apiKey = authHeader.split(' ')[1];
    if (!apiKey) {
      return res.status(401).json({ error: 'API key is missing.' });
    }

    // 2. Hash the key and find it in the database
    const hashedKey = hashApiKey(apiKey);

    // 3. Find the key, its user, their sub, and their plan all in one query
    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashedKey },
      include: {
        user: {
          include: {
            currentSubscription: {
              include: {
                plan: true // We need the plan to get the quota limits
              }
            }
          }
        }
      }
    });

    // 4. --- Run all validation checks ---
    
    // Check 1: Is the key valid?
    if (!key) {
      return res.status(401).json({ error: 'Invalid API key.' });
    }

    // --- Save user/key data for the 'finish' event logger ---
    apiKeyData = key;
    userData = key.user;

    // Check 2: Is the key revoked?
    if (key.status === 'revoked') {
      return res.status(403).json({ error: 'This API key has been revoked.' });
    }

    // Check 3: Is the user's account active?
    if (key.user.accountStatus === 'suspended') {
      return res.status(403).json({ error: 'User account is suspended.' });
    }

    // Check 4: Does the user have an active subscription?
    const subscription = key.user.currentSubscription;
    if (!subscription || subscription.status !== 'active') {
      return res.status(402).json({ error: 'Payment required. No active subscription found.' });
    }

    // Check 5: Are they over their monthly quota?
    const plan = subscription.plan;
    const periodStart = subscription.currentPeriodStart;
    
    const usageCount = await prisma.apiUsageLog.count({
      where: {
        userId: key.userId,
        requestTimestamp: { 
          gte: periodStart // gte = "greater than or equal to"
        }
      }
    });

    if (usageCount >= plan.requestLimitMonthly) {
      return res.status(429).json({ 
        error: `Monthly quota exceeded. Limit: ${plan.requestLimitMonthly} requests.` 
      });
    }

    // --- All checks passed! ---
    
    // Update the key's last_used timestamp (fire and forget)
    prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() }
    }).catch(err => console.error('Failed to update lastUsedAt:', err));
    
    // Attach user and plan info to the request for the main controller to use
    req.user = key.user;
    req.subscription = subscription;
    
    next(); // Proceed to the actual API logic (e.g., /v1/try-on)

  } catch (error) {
    console.error('Error in API auth middleware:', error);
    // Don't send detailed error info to the client
    res.status(500).json({ error: 'Internal server error.' });
    next(error);
  }
};

module.exports = { apiAuthMiddleware };