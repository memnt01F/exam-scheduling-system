/**
 * Exam Group routes — groups of courses that share a single exam day.
 *
 * GET    /api/exam-groups?termId=  → list all groups (optionally filtered by term)
 * POST   /api/exam-groups          → create a group { name, termId, courseCodes }
 * PUT    /api/exam-groups/:id      → update a group
 * DELETE /api/exam-groups/:id      → delete a group
 */
const express = require("express");
const mongoose = require("mongoose");
const ExamGroup = require("../models/examGroup.model");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.termId) filter.termId = req.query.termId;
    const groups = await ExamGroup.find(filter).sort({ name: 1 });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, termId, courseCodes } = req.body || {};
    if (!name || !termId || !Array.isArray(courseCodes) || courseCodes.length < 2) {
      return res.status(400).json({
        message: "name, termId, and at least 2 courseCodes are required",
      });
    }
    const group = await ExamGroup.create({
      name: name.trim(),
      termId,
      courseCodes: courseCodes.map(c => String(c).replace(/\s+/g, "").toUpperCase()),
    });
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { name, termId, courseCodes } = req.body || {};
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (termId !== undefined) update.termId = termId;
    if (Array.isArray(courseCodes)) {
      if (courseCodes.length < 2)
        return res.status(400).json({ message: "At least 2 courseCodes are required" });
      update.courseCodes = courseCodes.map(c => String(c).replace(/\s+/g, "").toUpperCase());
    }
    const group = await ExamGroup.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!group) return res.status(404).json({ message: "Exam group not found" });
    res.json(group);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const group = await ExamGroup.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: "Exam group not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
