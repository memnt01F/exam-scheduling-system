/**
 * Preference routes — coordinator exam scheduling preferences for Phase 0 and Phase 1.
 *
 * GET  /api/preferences              → list preferences (filter by termId and/or courseCode)
 * POST /api/preferences              → upsert preference (create or update by courseCode + termId)
 * PUT  /api/preferences/:id          → update preference by _id
 */
const express = require("express");
const CoursePreference = require("../models/coursePreference.model");

const router = express.Router();

const UPDATABLE_FIELDS = [
  "examType",
  "major1Weeks",
  "major2Weeks",
  "midtermWeeks",
  "preferredDays",
  "unpreferredDays",
  "comments",
  "status",
  "submittedAt",
];

/** GET /api/preferences?courseCode=&termId= */
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.courseCode) filter.courseCode = String(req.query.courseCode).toUpperCase().trim();
    if (req.query.termId) filter.termId = req.query.termId;
    const prefs = await CoursePreference.find(filter).sort({ createdAt: -1 });
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/preferences — upsert by (courseCode, termId).
 * If a document for this course + term already exists, update it.
 * Otherwise create a new one. This supports auto-save draft behaviour.
 */
router.post("/", async (req, res) => {
  try {
    const { courseCode, termId, submittedBy, ...rest } = req.body || {};
    if (!courseCode || !termId || !submittedBy) {
      return res.status(400).json({ message: "courseCode, termId, and submittedBy are required" });
    }

    const update = { submittedBy };
    for (const k of UPDATABLE_FIELDS) {
      if (k in rest) update[k] = rest[k];
    }

    const pref = await CoursePreference.findOneAndUpdate(
      { courseCode: courseCode.toUpperCase().trim(), termId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(pref);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/preferences/:id — update by Mongo _id. */
router.put("/:id", async (req, res) => {
  try {
    const update = {};
    for (const k of UPDATABLE_FIELDS) {
      if (k in req.body) update[k] = req.body[k];
    }

    const pref = await CoursePreference.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!pref) return res.status(404).json({ message: "Preference not found" });

    res.json(pref);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
