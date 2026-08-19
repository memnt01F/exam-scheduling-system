/**
 * labCode — the lab ↔ parent course convention.
 *
 * A laboratory is an ordinary Course whose code carries a `_LAB` suffix:
 *   ICS108 (lecture)  →  ICS108_LAB (lab)
 *
 * The suffix IS the relationship. Nothing is stored on the Course document, so
 * the parent is always derived from the code itself. That keeps the join key
 * (`courseCode`) unchanged across enrollments, bookings, preferences,
 * assignments, exam groups, and the Python scheduler service.
 *
 * UNDERSCORE, NEVER A HYPHEN. The registrar sync runs
 * `Course.deleteMany({ code: /-/ })` on every import
 * (services/courseOfferingService.js) — a hyphenated lab code would be
 * silently deleted on the next sync.
 *
 * NOTE: a copy of this logic exists in src/lib/labCode.js for the Add Course
 * modal. If the convention changes, update both files.
 */

const { normalizeCode } = require('./assignLevel');

const LAB_SUFFIX = '_LAB';

/** True when a course code refers to a laboratory. */
function isLabCode(code) {
  return normalizeCode(code).endsWith(LAB_SUFFIX);
}

/**
 * Parent lecture code for a lab code, or null when the code is not a lab.
 * 'ICS108_LAB' → 'ICS108';  'ICS108' → null;  '_LAB' → null.
 */
function parentCodeOf(code) {
  const norm = normalizeCode(code);
  if (!norm.endsWith(LAB_SUFFIX)) return null;
  const parent = norm.slice(0, -LAB_SUFFIX.length);
  return parent || null;
}

/** Lab code for a parent lecture code. 'ICS 108' → 'ICS108_LAB'. */
function labCodeFor(code) {
  const norm = normalizeCode(code);
  if (!norm) return '';
  return norm.endsWith(LAB_SUFFIX) ? norm : `${norm}${LAB_SUFFIX}`;
}

/** Display name for a lab derived from its parent's name. */
function labNameFor(parentName) {
  return `${String(parentName || '').trim()} (Lab)`.trim();
}

module.exports = { LAB_SUFFIX, isLabCode, parentCodeOf, labCodeFor, labNameFor };
