/**
 * Audit log routes — GET (list) + POST (manual entry from frontend).
 */
const express = require("express");
const AuditLog = require("../models/auditLog.model");

const router = express.Router();

/** GET /api/auditlogs — last 200 entries, newest first. */
router.get("/", async (_req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/auditlogs — record a custom audit entry from the frontend.
 *
 * Accepts: { action, user, role?, courseCode?, details?, metadata? }
 * `action` is the only required field.
 */
router.post("/", async (req, res) => {
  try {
    const { action, user, role, courseCode, details, metadata } = req.body || {};
    if (!action) return res.status(400).json({ message: "action is required" });

    const log = await AuditLog.create({
      action,
      user: user || "system",
      role: role || "coordinator",
      courseCode: courseCode ? String(courseCode).toUpperCase().trim() : undefined,
      details: details || "",
      metadata: metadata || undefined,
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
