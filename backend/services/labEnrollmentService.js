/**
 * labEnrollmentService — keeps a laboratory's enrollment roster identical to
 * its parent lecture course.
 *
 * A lab (ICS108_LAB) never appears in the registrar's enrollment file — only
 * the lecture (ICS108) does. But the roster is what conflict detection runs
 * on, so the lab needs its own copy of it: the solver builds a hard
 * "not the same day" constraint from every pair of exams sharing a student,
 * and 100% shared students is exactly what keeps a lab exam off its parent's
 * exam day.
 *
 * The copy has to be re-applied after every import because
 * POST /api/enrollments/upload replaces a term wholesale
 * (deleteMany({termId}) then insert), which wipes the lab's rows along with
 * everything else.
 *
 * The lab → parent link is the `_LAB` suffix itself (see utils/labCode.js);
 * nothing is stored on the Course document.
 */

const Course = require("../models/course.model");
const Enrollment = require("../models/enrollment.model");
const AcademicTerm = require("../models/academicTerm.model");
const { LAB_SUFFIX, parentCodeOf } = require("../utils/labCode");
const { normalizeCode } = require("../utils/assignLevel");

const BATCH = 5000;

/**
 * Terms a newly created lab should be backfilled into: active + upcoming only.
 * Past terms keep the roster they actually had.
 *
 * `status` can lag behind reality (it is only recalculated on activation), so
 * the date is the primary signal and `isActive` is honoured regardless.
 */
async function activeAndUpcomingTerms() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, same format as the stored dates
  return AcademicTerm.find({
    $or: [
      { isActive: true },
      { endDate: { $gte: today } },
      { status: "upcoming" },
    ],
  }).select("_id name");
}

/**
 * Copy parent enrollments into every lab course for one term.
 *
 * Delete-then-insert per lab, so running it repeatedly is idempotent and a
 * shrinking parent roster never leaves stale lab rows behind.
 *
 * @param {object}   opts
 * @param {ObjectId} opts.termId    the term to sync
 * @param {string[]} [opts.labCodes] restrict to these lab codes (defaults to all)
 * @returns {Promise<Array<{labCode, parentCode, copied, parentRows, skipped?}>>}
 *          one entry per lab — `skipped` explains why a lab got nothing, which
 *          is the only way an orphaned lab becomes visible instead of silently
 *          dropping out of the schedule.
 */
async function syncLabEnrollments({ termId, labCodes = null }) {
  if (!termId) return [];

  // Always constrain to the `_LAB` suffix, even when the caller names codes —
  // a non-lab code must never be treated as a lab.
  const filter = { status: "active", code: new RegExp(`${LAB_SUFFIX}$`) };
  if (Array.isArray(labCodes) && labCodes.length) {
    filter.$and = [{ code: { $in: labCodes.map(normalizeCode) } }];
  }

  const labs = await Course.find(filter).select("code name level");
  if (labs.length === 0) return [];

  // One lookup for every parent instead of one per lab.
  const parentByLab = new Map();
  for (const lab of labs) {
    const parent = parentCodeOf(lab.code);
    if (parent) parentByLab.set(lab.code, parent);
  }
  const parents = await Course.find({
    status: "active",
    code: { $in: [...new Set(parentByLab.values())] },
  }).select("code");
  const knownParents = new Set(parents.map((c) => c.code));

  const report = [];

  for (const lab of labs) {
    const parentCode = parentByLab.get(lab.code);

    if (!parentCode) {
      report.push({ labCode: lab.code, parentCode: null, copied: 0, parentRows: 0,
        skipped: "could not derive a parent course code" });
      continue;
    }
    if (!knownParents.has(parentCode)) {
      // Parent deleted or renamed. Clear the stale copy rather than leaving a
      // roster that no longer matches anything.
      const removed = await Enrollment.deleteMany({ termId, courseCode: lab.code });
      report.push({ labCode: lab.code, parentCode, copied: 0, parentRows: 0,
        skipped: `parent course ${parentCode} not found${removed.deletedCount ? ` — cleared ${removed.deletedCount} stale row(s)` : ""}` });
      continue;
    }

    const parentRows = await Enrollment.find({ termId, courseCode: parentCode })
      .select("studentId section")
      .lean();

    await Enrollment.deleteMany({ termId, courseCode: lab.code });

    if (parentRows.length === 0) {
      report.push({ labCode: lab.code, parentCode, copied: 0, parentRows: 0,
        skipped: `${parentCode} has no enrollments for this term` });
      continue;
    }

    const docs = parentRows.map((row) => ({
      studentId: row.studentId,
      courseCode: lab.code,
      courseName: lab.name,
      level: lab.level,
      section: row.section,
      termId,
    }));

    let copied = 0;
    for (let i = 0; i < docs.length; i += BATCH) {
      const inserted = await Enrollment.insertMany(docs.slice(i, i + BATCH), { ordered: false });
      copied += inserted.length;
    }

    report.push({ labCode: lab.code, parentCode, copied, parentRows: parentRows.length });
  }

  return report;
}

module.exports = { syncLabEnrollments, activeAndUpcomingTerms };
