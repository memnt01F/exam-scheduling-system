const crypto = require('crypto');

/**
 * Deterministic masking for student IDs using plain SHA-256.
 * Takes the first 8 hex chars of the hash, parses as a 32-bit integer,
 * mods by 10,000,000 → a consistent 7-digit masked ID (e.g. "0482931").
 * No secret required — the same raw ID always produces the same masked ID.
 */
function hashStudentId(rawId) {
  const hex = crypto.createHash('sha256').update(String(rawId).trim()).digest('hex');
  return String(parseInt(hex.slice(0, 8), 16) % 10000000).padStart(7, '0');
}

module.exports = { hashStudentId };
