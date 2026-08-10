/**
 * assignLevel — canonical course level assignment utility.
 *
 * Called ONLY when inserting a brand-new course for the first time.
 * Never called on existing courses — admin owns level after first insert.
 *
 * Rules (checked in order):
 *   1. Code in LEVEL_1_CODES set     → Level 1 (foundational courses that don't follow number rules)
 *   2. Prefix is "GS"                → Level 1 (all General Studies courses)
 *   3. Course number 100–299         → Level 2
 *   4. Course number 300–399         → Level 3
 *   5. Course number 400+            → Level 4
 *   6. Everything else               → Level 2 (safe default)
 *
 * NOTE: A copy of this logic exists in src/components/admin/ReferenceData.jsx
 * for UX auto-fill in the Add Course modal. That copy is not authoritative for
 * data writes. If these rules change, update both files.
 */

const LEVEL_1_CODES = new Set([
    'CHEM101', 'CHEM102', 'STAT201', 'MATH101', 'MATH208', 'MATH102', 'MATH201',
    'BUS200', 'PHYS101', 'PHYS102', 'IAS111', 'IAS212', 'IAS322', 'COE202',
    'CGS392', 'ENGL101', 'ENGL214', 'COE292', 'ICS104', 'ENGL102', 'ISE291',
    'IAS121', 'IAS330', 'IAS331', 'IAS430', 'ICS108',
]);

function normalizeCode(raw) {
    return String(raw || '').replace(/\s+/g, '').toUpperCase().trim();
}

function parseCourseCode(code) {
    const norm = normalizeCode(code);
    const match = norm.match(/^([A-Z]+)(\d+)/);
    if (!match) return { prefix: '', num: 0 };
    return { prefix: match[1], num: parseInt(match[2], 10) };
}

function assignLevel(code) {
    const norm = normalizeCode(code);
    if (LEVEL_1_CODES.has(norm)) return 1;
    const { prefix, num } = parseCourseCode(code);
    if (prefix === 'GS') return 1;
    if (num >= 100 && num < 300) return 3;
    if (num >= 300 && num < 400) return 3;
    if (num >= 400) return 4;
    return 2;
}

module.exports = { assignLevel, normalizeCode };