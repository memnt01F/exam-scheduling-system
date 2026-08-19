/**
 * labCode — the lab ↔ parent course convention (frontend copy).
 *
 * A laboratory is an ordinary course whose code carries a `_LAB` suffix:
 *   ICS108 (lecture)  →  ICS108_LAB (lab)
 *
 * Used by the Add Course modal to derive what a lab will look like before it
 * is created. The backend derives the same values independently — this copy is
 * for preview only and is NOT authoritative for data writes.
 *
 * Canonical implementation: backend/utils/labCode.js
 * If the convention changes, update both files.
 */

export const LAB_SUFFIX = '_LAB';

/** Remove whitespace and uppercase — same rule as the backend's normalizeCode. */
export function normalizeCode(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase().trim();
}

/** True when a course code refers to a laboratory. */
export function isLabCode(code) {
  return normalizeCode(code).endsWith(LAB_SUFFIX);
}

/**
 * Parent lecture code for a lab code, or null when the code is not a lab.
 * 'ICS108_LAB' → 'ICS108';  'ICS108' → null.
 */
export function parentCodeOf(code) {
  const norm = normalizeCode(code);
  if (!norm.endsWith(LAB_SUFFIX)) return null;
  const parent = norm.slice(0, -LAB_SUFFIX.length);
  return parent || null;
}

/** Lab code for a parent lecture code. 'ICS 108' → 'ICS108_LAB'. */
export function labCodeFor(code) {
  const norm = normalizeCode(code);
  if (!norm) return '';
  return norm.endsWith(LAB_SUFFIX) ? norm : `${norm}${LAB_SUFFIX}`;
}

/** Display name for a lab derived from its parent's name. */
export function labNameFor(parentName) {
  return `${String(parentName || '').trim()} (Lab)`.trim();
}
