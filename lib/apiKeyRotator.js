const prisma = require('../lib/prisma');
/**
 * Fetches the next available Gemini API key and manages its request count.
 * This is transactional to prevent race conditions.
 * @returns {Promise<string>} The API key.
 * @throws {Error} If all keys are rate-limited.
 */
async function getNextApiKey() {
  const MAX_REQUESTS = 249;

  try {
    const keyToUse = await prisma.$transaction(async (tx) => {
      // 1. Find the next available key
      const nextKey = await tx.geminiApiKey.findFirst({
        where: {
          isRateLimited: false,
          requestCount: { lt: MAX_REQUESTS }
        },
        orderBy: {
          lastUsedAt: 'asc' // Use the least recently used key
        }
      });

      if (!nextKey) {
        throw new Error('All Gemini API keys are currently rate-limited.');
      }

      // 2. Update the key's count
      const newCount = nextKey.requestCount + 1;
      const isNowRateLimited = newCount >= MAX_REQUESTS;

      await tx.geminiApiKey.update({
        where: { id: nextKey.id },
        data: {
          requestCount: newCount,
          isRateLimited: isNowRateLimited,
          lastUsedAt: new Date()
        }
      });

      return nextKey.key;
    });

    return keyToUse;

  } catch (error) {
    console.error('Error in getNextApiKey:', error.message);
    throw error;
  }
}

/**
 * Resets all Gemini API key counts to 0.
 * This is intended to be run daily by a scheduler.
 */
async function resetDailyCounts() {
  try {
    const { count } = await prisma.geminiApiKey.updateMany({
      data: {
        requestCount: 0,
        isRateLimited: false
      }
    });
    console.log(`[Scheduler] Reset ${count} Gemini API key counts.`);
  } catch (error) {
    console.error('[Scheduler] Error resetting API key counts:', error);
  }
}

module.exports = {
  getNextApiKey,
  resetDailyCounts
};