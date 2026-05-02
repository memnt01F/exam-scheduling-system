/**
 * Anchor slot routes — committee-fixed Level 1 exam configuration.
 */
const express = require("express");
const AnchorSlot = require("../models/anchorSlot.model");
const AuditLog = require("../models/auditLog.model");

const router = express.Router();

/** GET /api/anchors */
router.get("/", async (_req, res) => {
  try {
    const slots = await AnchorSlot.find().sort({ courseCode: 1 });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/anchors — upsert by (termId, courseCode).
 *
 * Re-anchoring the same course replaces the existing slot rather than
 * erroring on the unique index.
 */
router.post("/", async (req, res) => {
  try {
    const { termId, courseCode, courseName, examType, week, date, updatedBy } = req.body || {};
    if (!courseCode || !examType || !week || !date) {
      return res.status(400).json({ message: "courseCode, examType, week, date are required" });
    }
    const normalized = String(courseCode).trim().toUpperCase();
    const tid = termId || "current";

    // FIX: was upserting by { termId, courseCode } alone which meant booking Major 2
    // overwrote the Major 1 record. Now upserts by { termId, courseCode, examType }
    // so each exam type is stored as a separate independent document.
    const slot = await AnchorSlot.findOneAndUpdate(
      { termId: tid, courseCode: normalized, examType },
      {
        termId: tid,
        courseCode: normalized,
        courseName,
        examType,
        week,
        date,
        bookingStatus: "booked",
        updatedBy: updatedBy || "Committee",
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await AuditLog.create({
      action: "CREATE_ANCHOR",
      user: updatedBy || "Committee",
      role: "committee",
      courseCode: normalized,
      details: `Anchored ${normalized} ${examType} — Week ${week}, ${date}`,
    });

    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/anchors/:id */
router.delete("/:id", async (req, res) => {
  try {
    const slot = await AnchorSlot.findById(req.params.id);
    if (!slot) return res.status(404).json({ message: "Anchor slot not found" });
    await slot.deleteOne();
    await AuditLog.create({
      action: "DELETE_ANCHOR",
      user: req.body?.deletedBy || "Committee",
      role: "committee",
      courseCode: slot.courseCode,
      details: `Removed anchor for ${slot.courseCode}`,
    });
    res.json({ message: "Anchor slot deleted", slot });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
