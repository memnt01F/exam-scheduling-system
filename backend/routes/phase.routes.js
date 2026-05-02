/**
 * Phase routes — GET (auto-seeds defaults) and PUT (by _id or phaseNumber).
 */
const express = require("express");
const mongoose = require("mongoose");
const Phase = require("../models/phase.model");
const AuditLog = require("../models/auditLog.model");

const router = express.Router();

const DEFAULT_PHASES = [
  {
    phaseNumber: 0,
    name: "Phase 0",
    description: "Pre-configured anchor slots for Level 1 courses",
    startDate: new Date("2026-01-11"),
    endDate: new Date("2026-01-25"),
    isActive: false,
    targetLevels: [1],
  },
  {
    phaseNumber: 1,
    name: "Phase 1",
    description: "Booking for Level 2 courses",
    startDate: new Date("2026-01-26"),
    endDate: new Date("2026-02-15"),
    isActive: false,
    targetLevels: [2],
  },
  {
    phaseNumber: 2,
    name: "Phase 2",
    description: "Booking for Level 3 and Level 4 courses",
    startDate: new Date("2026-02-16"),
    endDate: new Date("2026-03-08"),
    isActive: false,
    targetLevels: [3, 4],
  },
];

/** GET /api/phases — returns all, seeding defaults if empty. */
router.get("/", async (_req, res) => {
  try {
    let phases = await Phase.find().sort({ phaseNumber: 1 });
    if (phases.length === 0) {
      await Phase.insertMany(DEFAULT_PHASES);
      phases = await Phase.find().sort({ phaseNumber: 1 });
    }
    res.json(phases);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/phases/:id — id may be Mongo _id OR phaseNumber. */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const update = {};
    const allowed = ["name", "description", "startDate", "endDate", "isActive", "targetLevels", "updatedBy"];
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];

    let before = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      before = await Phase.findById(id);
    }
    if (!before) {
      const num = parseInt(id, 10);
      if (!Number.isNaN(num)) before = await Phase.findOne({ phaseNumber: num });
    }
    if (!before) return res.status(404).json({ message: "Phase not found" });

    const phase = await Phase.findByIdAndUpdate(before._id, update, { new: true });

    const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
    const oldSummary = `${fmt(before.startDate)}→${fmt(before.endDate)} active=${before.isActive}`;
    const newSummary = `${fmt(phase.startDate)}→${fmt(phase.endDate)} active=${phase.isActive}`;

    await AuditLog.create({
      action: "UPDATE_PHASE",
      user: update.updatedBy || "committee",
      role: req.body.role || "committee",
      details: `Updated ${phase.name}: ${oldSummary} → ${newSummary}`,
      metadata: {
        before: { startDate: before.startDate, endDate: before.endDate, isActive: before.isActive },
        after: { startDate: phase.startDate, endDate: phase.endDate, isActive: phase.isActive },
      },
    });

    res.json(phase);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
