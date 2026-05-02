/**
 * Course routes — CRUD with audit logging.
 *
 * DELETE is soft (status=inactive) unless ?hard=true.
 */
const express = require("express");
const Course = require("../models/course.model");
const AuditLog = require("../models/auditLog.model");

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
    const { code, name, level, department, coordinator, status, createdBy } = req.body || {};
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
      coordinator: coordinator || "",
      status: status || "active",
    });

    await AuditLog.create({
      action: "CREATE_COURSE",
      user: createdBy || "admin",
      role: "admin",
      courseCode: normalized,
      details: `Created course ${normalized} — ${name} (L${level})`,
    });

    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/courses/:id */
router.put("/:id", async (req, res) => {
  try {
    const allowed = ["code", "name", "level", "department", "coordinator", "status"];
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
