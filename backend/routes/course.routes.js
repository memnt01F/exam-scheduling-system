/**
 * Course routes — CRUD with audit logging.
 *
 * DELETE is soft (status=inactive) unless ?hard=true.
 *
 * Laboratories are ordinary courses whose code ends in _LAB (ICS108_LAB).
 * Nothing about the schema or the payload differs; POST simply notices the
 * suffix and copies the parent's enrollment roster afterwards, because a lab
 * never appears in the registrar's enrollment file. See utils/labCode.js.
 */
const express = require("express");
const Course = require("../models/course.model");
const AuditLog = require("../models/auditLog.model");
const { isLabCode, parentCodeOf } = require("../utils/labCode");
const { syncLabEnrollments, activeAndUpcomingTerms } = require("../services/labEnrollmentService");
const { rebuildCourseConflicts } = require("../services/conflictsService");

const router = express.Router();

/** GET /api/courses — only active courses */
router.get("/", async (_req, res) => {
  try {
    const courses = await Course.find({ status: "active" }).sort({ code: 1 });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/courses */
router.post("/", async (req, res) => {
  try {
    const { code, name, level, department, status, createdBy } = req.body || {};
    if (!code || !name || level === undefined || level === null || !department) {
      return res.status(400).json({ message: "code, name, level, and department are required" });
    }

    const normalized = String(code).trim().toUpperCase();
    const existing = await Course.findOne({ code: normalized });
    if (existing) {
      return res.status(409).json({ message: "A course with this code already exists" });
    }

    const course = await Course.create({
      code: normalized,
      name,
      level: Number(level),
      department,
      status: status || "active",
    });

    // A lab starts life with no enrollments of its own — copy the parent's
    // roster into every active/upcoming term, then refresh the conflict cache
    // so the new rows are visible to the day-score heatmap.
    let labSync = null;
    let conflictsRebuilt = null;
    if (isLabCode(normalized)) {
      const terms = await activeAndUpcomingTerms();
      labSync = [];
      conflictsRebuilt = [];
      for (const term of terms) {
        try {
          const report = await syncLabEnrollments({ termId: term._id, labCodes: [normalized] });
          labSync.push(...report.map(r => ({ ...r, termId: term._id, termName: term.name })));
        } catch (err) {
          labSync.push({ labCode: normalized, parentCode: parentCodeOf(normalized), copied: 0,
            parentRows: 0, termId: term._id, termName: term.name, skipped: err.message });
          continue;
        }
        // Best effort: a scheduler that is down must not fail course creation.
        const rebuilt = await rebuildCourseConflicts(String(term._id));
        conflictsRebuilt.push({ termId: term._id, termName: term.name, ok: rebuilt.ok, message: rebuilt.message });
      }
    }

    const copiedTotal = labSync ? labSync.reduce((sum, l) => sum + l.copied, 0) : 0;

    await AuditLog.create({
      action: isLabCode(normalized) ? "CREATE_LAB_COURSE" : "CREATE_COURSE",
      user: createdBy || "admin",
      role: "admin",
      courseCode: normalized,
      details: isLabCode(normalized)
        ? `Created lab course ${normalized} for ${parentCodeOf(normalized)} — ${name} (L${level}); copied ${copiedTotal} enrollment(s)`
        : `Created course ${normalized} — ${name} (L${level})`,
      metadata: labSync ? { labSync, conflictsRebuilt } : undefined,
    });

    // Extra fields are additive — normalizeServerCourse on the client reads
    // named fields only, so this stays backward compatible.
    res.status(201).json(labSync ? { ...course.toObject(), labSync, conflictsRebuilt } : course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/courses/:id */
router.put("/:id", async (req, res) => {
  try {
    const allowed = ["code", "name", "level", "department", "status"];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if (update.code) update.code = String(update.code).trim().toUpperCase();

    const before = await Course.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Course not found" });

    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true });

    await AuditLog.create({
      action: "UPDATE_COURSE",
      user: req.body?.updatedBy || "admin",
      role: "admin",
      courseCode: course.code,
      details: `Updated course ${course.code}: ${Object.keys(update).join(", ")}`,
      metadata: { before: before.toObject(), after: course.toObject() },
    });

    res.json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/courses/:id — hard delete by default so it's truly gone from MongoDB */
router.delete("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Course not found" });

    await course.deleteOne();

    await AuditLog.create({
      action: "DELETE_COURSE",
      user: req.body?.deletedBy || "admin",
      role: "admin",
      courseCode: course.code,
      details: `Deleted course ${course.code}`,
    });

    res.json({ message: "Course deleted", course });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
