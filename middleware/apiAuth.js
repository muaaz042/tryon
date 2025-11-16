const { hashApiKey } = require('../utils/crypto'); 
const prisma = require('../lib/prisma');

/**
 * API Authentication Middleware
 * - Validates API Key
 * - Checks Usage Limits (Quota)
 * - Logs Usage
 * - Allows "Free Tier" if no subscription is found
 */
const apiAuthMiddleware = async (req, res, next) => {
  const startTime = Date.now();
  
  // Variables to hold data for the logging callback
  let apiKeyData = null;
  let userData = null;

  // --- Logging Logic (Runs after response is sent) ---
  res.on('finish', async () => {
    try {
      // Only log if we successfully identified a user and key
      if (apiKeyData && userData) {
        const responseTimeMs = Date.now() - startTime;
        
        // Fire and forget - don't await this to keep response fast
        await prisma.apiUsageLog.create({
          data: {
            userId: userData.id,
            apiKeyId: apiKeyData.id,
            httpMethod: req.method,
            endpoint: req.originalUrl,
            httpStatusCode: res.statusCode,
            responseTimeMs: responseTimeMs,
            creditsConsumed: 1, 
          },
        });
      }
    } catch (logError) {
      // If logging fails, just print to console. 
      // Do NOT call next(logError) because the response is already sent.
      console.error('Failed to write API usage log:', logError.message);
    }
  });

  // --- Main Auth Logic ---
  try {
    // 1. Get API Key
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    }
    const apiKey = authHeader.split(' ')[1];

    // 2. Find Key in DB
    const hashedKey = hashApiKey(apiKey);
    const key = await prisma.apiKey.findUnique({
      where: { keyHash: hashedKey },
      include: {
        user: {
          include: {
            currentSubscription: {
              include: { plan: true }
            }
          }
        }
      }
    });

    if (!key) return res.status(401).json({ error: 'Invalid API key.' });
    if (key.status === 'revoked') return res.status(403).json({ error: 'API key revoked.' });
    if (key.user.accountStatus === 'suspended') return res.status(403).json({ error: 'Account suspended.' });

    // Store for logging
    apiKeyData = key;
    userData = key.user;

    // 3. Determine Limits (Handle Free Tier vs Paid)
    const subscription = key.user.currentSubscription;
    let requestLimit = 0;
    let periodStart = new Date();
    
    // Default "Free Tier" limits if no active subscription
    // You can adjust these numbers
    const FREE_TIER_LIMIT = 5; 
    
    if (subscription && subscription.status === 'active') {
        requestLimit = subscription.plan.requestLimitMonthly;
        periodStart = subscription.currentPeriodStart;
    } else {
        // User has no sub or it's inactive -> Apply Free Tier
        requestLimit = FREE_TIER_LIMIT;
        // For free tier, just check usage for the last 30 days
        periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - 30);
    }

    // 4. Check Quota
    const usageCount = await prisma.apiUsageLog.count({
      where: {
        userId: key.userId,
        requestTimestamp: { gte: periodStart }
      }
    });

    if (usageCount >= requestLimit) {
      return res.status(429).json({ 
        error: 'Monthly quota exceeded.',
        limit: requestLimit,
        used: usageCount,
        plan: subscription ? subscription.plan.name : 'Free Tier'
      });
    }

    // 5. Update Last Used
    // Fire and forget update
    prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() }
    }).catch(err => console.error('Failed to update key lastUsedAt', err));

    // Attach info to request
    req.user = key.user;
    req.subscription = subscription;

    next();

  } catch (error) {
    console.error('Auth Middleware Error:', error);
    next(error);
  }
};

module.exports = { apiAuthMiddleware };