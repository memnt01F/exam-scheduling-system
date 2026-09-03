/**
 * Academic term routes — CRUD with activation logic.
 *
 * Activating a term marks it `isActive=true` and demotes any other
 * currently-active term to `status="past"`.
 */
const express = require("express");
const mongoose = require("mongoose");
const AcademicTerm = require("../models/academicTerm.model");
const Phase = require("../models/phase.model");
const CoursePreference = require("../models/coursePreference.model");
const AuditLog = require("../models/auditLog.model");
const SolverRunLog = require("../models/solverRunLog.model");

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

    // Block deletion of the currently active term
    if (term.isActive) {
      return res.status(409).json({
        message: "Cannot delete the active term. Deactivate it by setting another term as active first.",
      });
    }

    // Block deletion if any booking phase targets this term
    const phaseRef = await Phase.findOne({ targetTermId: term._id });
    if (phaseRef) {
      return res.status(409).json({
        message: `Cannot delete this term — it is the target term for "${phaseRef.name}". Reassign the phase first.`,
      });
    }

    // Block deletion if coordinator preferences have been submitted for this term
    const prefCount = await CoursePreference.countDocuments({ termId: term._id });
    if (prefCount > 0) {
      return res.status(409).json({
        message: `Cannot delete this term — ${prefCount} coordinator preference ${prefCount === 1 ? "submission has" : "submissions have"} been recorded against it.`,
      });
    }

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


/**
 * GET /api/terms/:id/solver-logs?phase=&limit=
 *
 * Scheduler run logs for a term, newest first. Read-only: these documents are
 * written by the Python scheduler service, never by this API.
 *
 * The solver's warnings used to be returned in the /solve response and then
 * thrown away. This is where they now live, so a silent decision (a course
 * defaulting to "Two Majors", a course skipped because it was already booked)
 * can be read back long after the run.
 */
router.get("/:id/solver-logs", async (req, res) => {
  try {
    // Guard the cast: findById on a malformed id throws a Mongoose
    // CastError, which would surface as a 500 leaking internals.
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Term not found" });
    }
    const term = await AcademicTerm.findById(req.params.id);
    if (!term) return res.status(404).json({ message: "Term not found" });

    const query = { termId: term._id };
    if (req.query.phase !== undefined && String(req.query.phase).trim() !== "") {
      // Validate rather than coerce: Number("") is 0, so a bare cast would
      // silently turn a typo into phase 0.
      if (!/^[0-9]+$/.test(String(req.query.phase).trim())) {
        return res.status(400).json({ message: "phase must be a non-negative integer." });
      }
      query.phaseNumber = Number(req.query.phase);
    }

    let limit = 50;
    if (req.query.limit !== undefined && String(req.query.limit).trim() !== "") {
      if (!/^[0-9]+$/.test(String(req.query.limit).trim())) {
        return res.status(400).json({ message: "limit must be a positive integer." });
      }
      limit = Math.min(Math.max(Number(req.query.limit), 1), 200);
    }

    const logs = await SolverRunLog.find(query)
      .sort({ finishedAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      termId: term._id,
      termName: term.name,
      // The term's own compact index, so a caller can see the run history
      // per phase without paging through the full documents.
      index: term.solverLogs || {},
      count: logs.length,
      logs,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
