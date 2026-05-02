/**
 * Academic term routes — CRUD with activation logic.
 *
 * Activating a term marks it `isActive=true` and demotes any other
 * currently-active term to `status="past"`.
 */
const express = require("express");
const AcademicTerm = require("../models/academicTerm.model");
const AuditLog = require("../models/auditLog.model");

const router = express.Router();

/** GET /api/terms */
router.get("/", async (_req, res) => {
  try {
    const terms = await AcademicTerm.find().sort({ createdAt: -1 });
    res.json(terms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/terms */
router.post("/", async (req, res) => {
  try {
    const { name, startDate, endDate, isActive, status, calendarData, createdBy } = req.body || {};
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ message: "name, startDate, endDate are required" });
    }

    if (isActive) {
      // Demote any currently active term.
      await AcademicTerm.updateMany(
        { isActive: true },
        { $set: { isActive: false, status: "past" } }
      );
    }

    const term = await AcademicTerm.create({
      name,
      startDate,
      endDate,
      isActive: !!isActive,
      status: status || (isActive ? "active" : "upcoming"),
      calendarData,
      createdBy: createdBy || "admin",
    });

    await AuditLog.create({
      action: "CREATE_TERM",
      user: createdBy || "admin",
      role: "admin",
      details: `Created term ${name} (${term.status})`,
    });

    res.status(201).json(term);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/terms/:id */
router.put("/:id", async (req, res) => {
  try {
    const allowed = ["name", "startDate", "endDate", "isActive", "status", "calendarData"];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];

    const before = await AcademicTerm.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "Term not found" });

    if (update.isActive) {
      await AcademicTerm.updateMany(
        { _id: { $ne: before._id }, isActive: true },
        { $set: { isActive: false, status: "past" } }
      );
      if (!update.status) update.status = "active";
    }

    const term = await AcademicTerm.findByIdAndUpdate(before._id, update, { new: true });

    await AuditLog.create({
      action: "UPDATE_TERM",
      user: req.body?.updatedBy || "admin",
      role: "admin",
      details: `Updated term ${term.name}: ${Object.keys(update).join(", ")}`,
    });

    res.json(term);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/terms/:id */
router.delete("/:id", async (req, res) => {
  try {
    const term = await AcademicTerm.findById(req.params.id);
    if (!term) return res.status(404).json({ message: "Term not found" });
    await term.deleteOne();
    await AuditLog.create({
      action: "DELETE_TERM",
      user: req.body?.deletedBy || "admin",
      role: "admin",
      details: `Deleted term ${term.name}`,
    });
    res.json({ message: "Term deleted", term });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
