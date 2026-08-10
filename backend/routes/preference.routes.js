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
  "editedBy",
];

// Valid examType values (mirrors the enum on the schema, minus null).
const EXAM_TYPES = ["Midterm", "Two Majors", "Three Majors"];

/** Coerce a value into a clean array of finite numbers. */
function toNumberArray(val) {
  if (!Array.isArray(val)) return [];
  return val.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

/** Coerce a value into a clean array of non-empty strings. */
function toStringArray(val) {
  if (!Array.isArray(val)) return [];
  return val.map((s) => String(s).trim()).filter(Boolean);
}

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

/**
 * POST /api/preferences/import — bulk import preferences for a single term.
 *
 * Body: {
 *   termId,                 // required — the currently selected term
 *   importedBy?,            // optional — defaults to "Admin"
 *   rows: [{ courseCode, examType, major1Weeks, major2Weeks, midtermWeeks,
 *            preferredDays, unpreferredDays, comments }]
 * }
 *
 * Courses that already have a preference for this term are NEVER overwritten —
 * they are skipped. Only brand-new courses are inserted. Course codes are
 * upper-cased and whitespace-stripped before comparison and storage.
 *
 * Returns { inserted, skipped, insertedCodes, skippedCodes }.
 */
router.post("/import", async (req, res) => {
  try {
    const { termId, importedBy, rows } = req.body || {};
    if (!termId) return res.status(400).json({ message: "termId is required" });
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "rows must be a non-empty array" });
    }
    const by = (importedBy && String(importedBy).trim()) || "Admin";

    // Existing course codes for this term — these are protected from overwrite.
    const existing = await CoursePreference.find({ termId }).select("courseCode").lean();
    const existingSet = new Set(existing.map((p) => String(p.courseCode).toUpperCase().trim()));

    const now = new Date();
    const seen = new Set();
    const docs = [];
    const insertedCodes = [];
    const skippedCodes = [];

    for (const row of rows) {
      const code = String(row?.courseCode || "").toUpperCase().replace(/\s+/g, "").trim();
      if (!code) continue;
      // Skip courses that already exist for this term, or duplicated within the file.
      if (existingSet.has(code) || seen.has(code)) {
        skippedCodes.push(code);
        continue;
      }
      seen.add(code);
      insertedCodes.push(code);
      docs.push({
        courseCode: code,
        termId,
        submittedBy: by,
        editedBy: by,
        examType: EXAM_TYPES.includes(row?.examType) ? row.examType : null,
        major1Weeks: toNumberArray(row?.major1Weeks),
        major2Weeks: toNumberArray(row?.major2Weeks),
        midtermWeeks: toNumberArray(row?.midtermWeeks),
        preferredDays: toStringArray(row?.preferredDays),
        unpreferredDays: toStringArray(row?.unpreferredDays),
        comments: row?.comments ? String(row.comments) : "",
        status: "submitted",
        submittedAt: now,
      });
    }

    let inserted = 0;
    if (docs.length > 0) {
      try {
        const created = await CoursePreference.insertMany(docs, { ordered: false });
        inserted = created.length;
      } catch (bulkErr) {
        // Tolerate a rare race on the unique (courseCode, termId) index —
        // report only the documents that were actually inserted.
        inserted = bulkErr?.insertedDocs?.length ?? 0;
      }
    }

    res.status(200).json({
      inserted,
      skipped: skippedCodes.length,
      insertedCodes,
      skippedCodes,
    });
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
