const crypto = require('crypto');

/**
 * Hashes an API key using SHA-256.
 * @param {string} apiKey - The plain-text API key.
 * @returns {string} The SHA-256 hash.
 */
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

module.exports = { hashApiKey };