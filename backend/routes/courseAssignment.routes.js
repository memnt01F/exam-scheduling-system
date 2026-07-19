const express = require("express");
const CourseAssignment = require("../models/courseAssignment.model");

const router = express.Router();

/** GET /api/course-assignments?coordinatorId=&courseCode= */
router.get("/", async (req, res) => {
  try {
    const { coordinatorId, courseCode } = req.query;
    const query = {};
    if (coordinatorId) query.coordinatorId = coordinatorId;
    if (courseCode)    query.courseCode = String(courseCode).toUpperCase().trim();

    const assignments = await CourseAssignment.find(query).sort({ courseCode: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/course-assignments — upsert one assignment */
router.post("/", async (req, res) => {
  try {
    const { courseCode, coordinatorId, assignedBy } = req.body || {};
    if (!courseCode || !coordinatorId) {
      return res.status(400).json({ message: "courseCode and coordinatorId are required" });
    }
    const normalized = String(courseCode).trim().toUpperCase();
    const assignment = await CourseAssignment.findOneAndUpdate(
      { courseCode: normalized },
      { courseCode: normalized, coordinatorId, assignedBy: assignedBy || "" },
      { upsert: true, new: true }
    );
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/course-assignments/bulk
 * body: { assignments: [{ courseCode, coordinatorId }], assignedBy }
 * Empty coordinatorId = delete that assignment.
 */
router.post("/bulk", async (req, res) => {
  try {
    const { assignments = [], assignedBy } = req.body || {};

    let upserted = 0;
    let deleted = 0;

    for (const { courseCode, coordinatorId } of assignments) {
      const normalized = String(courseCode || "").trim().toUpperCase();
      if (!normalized) continue;
      if (coordinatorId) {
        await CourseAssignment.findOneAndUpdate(
          { courseCode: normalized },
          { courseCode: normalized, coordinatorId, assignedBy: assignedBy || "" },
          { upsert: true, new: true }
        );
        upserted++;
      } else {
        await CourseAssignment.deleteOne({ courseCode: normalized });
        deleted++;
      }
    }

    res.json({ message: "Bulk save complete", upserted, deleted });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/course-assignments/:id */
router.delete("/:id", async (req, res) => {
  try {
    const assignment = await CourseAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    await assignment.deleteOne();
    res.json({ message: "Assignment deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
