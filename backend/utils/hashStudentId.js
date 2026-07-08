const K = 97;
const MODULUS = 1_000_000_000; // 10^9

/**
 * Collision-free masking for 9-digit student IDs.
 * Formula: (ID × K) mod 10^9
 * K=97 is coprime with 10^9 (not divisible by 2 or 5), guaranteeing
 * a bijection over the 9-digit domain — no two IDs produce the same output.
 * Max product: 999999999 × 97 = 96,999,999,903 — well within JS safe integer range.
 */
function hashStudentId(rawId) {
  const id = parseInt(String(rawId).trim(), 10);
  return String((id * K) % MODULUS).padStart(9, '0');
}

module.exports = { hashStudentId };
