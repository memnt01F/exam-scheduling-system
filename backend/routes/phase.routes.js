/**
 * Phase routes — per-term phase management.
 *
 * GET    /api/phases              — all phases (optionally ?termId=xxx)
 * POST   /api/phases/init/:termId — auto-create Phase 0/1/2 for a term
 * POST   /api/phases              — create a single phase
 * PUT    /api/phases/:id          — update a phase (by _id or phaseNumber)
 */
const express   = require("express");
const mongoose  = require("mongoose");
const Phase     = require("../models/phase.model");
const AuditLog  = require("../models/auditLog.model");

const router = express.Router();

const PHASE_TEMPLATES = [
  {
    phaseNumber: 0,
    name: "Phase 0",
    description: "Preference collection for Level 1 courses",
    targetLevels: [1],
  },
  {
    phaseNumber: 1,
    name: "Phase 1",
    description: "Preference collection for Level 2 courses",
    targetLevels: [2],
  },
  {
    phaseNumber: 2,
    name: "Phase 2",
    description: "Preference collection for Level 3 and Level 4 courses",
    targetLevels: [3, 4],
  },
];

// One-time migration: drop the old global unique index on phaseNumber if it still exists.
let migrationDone = false;
async function migrateIndex() {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const indexes = await Phase.collection.indexes();
    const old = indexes.find(i => i.name === 'phaseNumber_1' && i.unique);
    if (old) {
      await Phase.collection.dropIndex('phaseNumber_1');
      console.log('[phases] Dropped legacy unique index on phaseNumber');
    }
  } catch (err) {
    console.warn('[phases] Index migration skipped:', err.message);
  }
}

/** GET /api/phases?termId=xxx */
router.get("/", async (req, res) => {
  try {
    await migrateIndex();
    const filter = {};
    if (req.query.termId) filter.targetTermId = req.query.termId;
    const phases = await Phase.find(filter).sort({ phaseNumber: 1 });
    return res.json(phases);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/** POST /api/phases/init/:termId — create Phase 0/1/2 for a term if they don't exist yet */
router.post("/init/:termId", async (req, res) => {
  const { termId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(termId)) {
    return res.status(400).json({ message: "Invalid termId" });
  }
  try {
    const existing = await Phase.find({ targetTermId: termId });
    if (existing.length > 0) {
      return res.json({ message: "Phases already exist for this term", phases: existing });
    }

    const now = new Date();
    const docs = PHASE_TEMPLATES.map(t => ({
      ...t,
      targetTermId: termId,
      startDate: now,
      endDate: now,
      isActive: false,
    }));

    const phases = await Phase.insertMany(docs);
    return res.status(201).json({ message: "Phases initialized", phases });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/** POST /api/phases — create a single phase */
router.post("/", async (req, res) => {
  try {
    const { phaseNumber, name, description, startDate, endDate, isActive, targetLevels, targetTermId, updatedBy } = req.body;
    const phase = await Phase.create({ phaseNumber, name, description, startDate, endDate, isActive, targetLevels, targetTermId, updatedBy });
    return res.status(201).json(phase);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "A phase with this number already exists for this term" });
    return res.status(500).json({ message: err.message });
  }
});

/** PUT /api/phases/:id — id may be Mongo _id OR phaseNumber */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const update = {};
    const allowed = ["name", "description", "startDate", "endDate", "isActive", "targetLevels", "targetTermId", "updatedBy"];
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
      user: update.updatedBy || "admin",
      role: req.body.role || "admin",
      details: `Updated ${phase.name}: ${oldSummary} → ${newSummary}`,
      metadata: {
        before: { startDate: before.startDate, endDate: before.endDate, isActive: before.isActive },
        after:  { startDate: phase.startDate,  endDate: phase.endDate,  isActive: phase.isActive  },
      },
    });

    return res.json(phase);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
