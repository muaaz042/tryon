const cron = require('node-cron');
const { resetDailyCounts } = require('./apiKeyRotator');

/**
 * Initializes the scheduler.
 * Runs once every day at midnight (00:00).
 */
function startScheduler() {
  console.log('Scheduler started. API key counts will reset daily at midnight.');
  
  // '0 0 * * *' = "At minute 0 of hour 0 (midnight) every day"
  cron.schedule('0 0 * * *', () => {
    console.log('[Scheduler] Running daily reset for Gemini API keys...');
    resetDailyCounts();
  }, {
    timezone: "UTC" // Or your preferred timezone
  });
}

module.exports = { startScheduler };