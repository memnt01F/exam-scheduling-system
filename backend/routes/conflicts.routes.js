/**
 * Conflict-cache routes — proxy to the Python scheduler service.
 *
 * POST /api/conflicts/rebuild?termId=<AcademicTerm._id>
 *   Rebuilds the `courseconflicts` cache from `enrollments` for one term.
 *   Equivalent to the scheduler's scripts/build_conflicts.py.
 *
 *   400 — termId missing or not a 24-hex ObjectId (e.g. a term NAME like "261")
 *   404 — no AcademicTerm with that _id
 *   502 — scheduler service unreachable
 *   otherwise the scheduler's own status and body are passed through
 *
 * The frontend has always called this path (services/api.js → rebuildConflicts),
 * but it was never mounted, so every call 404'd and the failure was swallowed
 * by a .catch() — leaving the cache stale after every enrollment upload.
 */
const express = require("express");
const AcademicTerm = require("../models/academicTerm.model");
const { rebuildCourseConflicts, isObjectIdString } = require("../services/conflictsService");

const router = express.Router();

/** POST /api/conflicts/rebuild?termId= */
router.post("/rebuild", async (req, res) => {
  try {
    const termId = String(req.query.termId || req.body?.termId || "").trim();

    if (!termId) {
      return res.status(400).json({ message: "termId query parameter is required" });
    }
    if (!isObjectIdString(termId)) {
      return res.status(400).json({
        message:
          `termId must be the AcademicTerm _id (24-character hex), got "${termId}". ` +
          `A term name such as "261" will not work.`,
      });
    }

    const term = await AcademicTerm.findById(termId).catch(() => null);
    if (!term) {
      return res.status(404).json({ message: `No academic term with _id "${termId}"` });
    }

    const result = await rebuildCourseConflicts(termId);
    if (!result.ok) {
      return res.status(result.status || 502).json({ message: result.message });
    }
    return res.json(result.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
