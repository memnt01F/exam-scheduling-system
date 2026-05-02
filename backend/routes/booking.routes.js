/**
 * Booking routes — GET, POST, PUT, DELETE.
 *
 * Fixes applied:
 * - GET: filters to only pending/approved bookings
 * - POST: proper create (not upsert), duplicate guard, status filter on conflict check, examType validation
 * - PUT: status filter on conflict check, duplicate guard checks courseCode+examType not just courseCode
 * - DELETE: soft-cancel (status="cancelled") instead of hard delete
 */
const express = require("express");
const Booking = require("../models/booking.model");
const AuditLog = require("../models/auditLog.model");
const { hasSameDayStudentConflict, normalizeCourseCode, parseDateToUtcDayBounds } = require("../services/conflictService");

const router = express.Router();

const VALID_EXAM_TYPES = ["Major 1", "Major 2", "Mid"];
const examMode = (t) => (t === "Mid" ? "mid" : "major");

/** GET /api/bookings — list active bookings (pending + approved) ordered by exam date. */
router.get("/", async (_req, res) => {
  try {
    const bookings = await Booking.find({
      status: { $in: ["pending", "approved"] },
    }).sort({ examDate: 1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/bookings/check-conflict — preview conflicts WITHOUT creating a booking.
 */
router.post("/check-conflict", async (req, res) => {
  try {
    const { courseCode, examDate, excludeBookingId } = req.body || {};
    if (!courseCode || !examDate) {
      return res.status(400).json({ message: "courseCode and examDate are required" });
    }

    const hasConflict = await hasSameDayStudentConflict({
      courseCode,
      examDate,
      excludeBookingId,
    });

    // Keep response minimal for UX speed.
    res.json({ hasConflict });
  } catch (err) {
    if (err?.code === "INVALID_EXAM_DATE") {
      return res.status(400).json({ message: "Invalid examDate" });
    }
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/bookings — create a booking. */
router.post("/", async (req, res) => {
  try {
    const {
      courseCode, examDate, level,
      maleProctors = 0, femaleProctors = 0,
      createdBy, examType, notes,
    } = req.body || {};

    if (!courseCode || !examDate || level === undefined || level === null || !createdBy) {
      return res.status(400).json({
        message: "courseCode, examDate, level, and createdBy are required",
      });
    }

    const normalized = normalizeCourseCode(courseCode);
    const type = examType || "Major 1";

    if (!VALID_EXAM_TYPES.includes(type)) {
      return res.status(400).json({
        message: `Invalid examType "${type}". Must be one of: ${VALID_EXAM_TYPES.join(", ")}`,
      });
    }

    const { startOfDayUtc } = parseDateToUtcDayBounds(examDate);
    const date = startOfDayUtc;

    // If a booking exists for (courseCode, examType) but was previously cancelled/rejected,
    // reuse it instead of inserting a new document (unique index would throw E11000).
    const existingAnyStatus = await Booking.findOne({
      courseCode: normalized,
      examType: type,
    });

    // Enforce Mid ↔ Major exclusivity at the API layer.
    // Major 1 and Major 2 are allowed to coexist (independent bookings).
    const activeForCourse = await Booking.find({
      courseCode: normalized,
      status: { $in: ["pending", "approved"] },
    }).select("examType");
    const requestedMode = examMode(type);
    const existingModes = new Set(activeForCourse.map((b) => examMode(b.examType)));
    if (existingModes.size > 0 && !existingModes.has(requestedMode)) {
      return res.status(409).json({
        message: `Cannot book ${type} while the course has ${[...existingModes].join(" & ")} bookings. Cancel existing bookings first.`,
        existingExamTypes: activeForCourse.map((b) => b.examType),
      });
    }

    // Duplicate guard: same course + same type already active.
    const duplicate = await Booking.findOne({
      courseCode: normalized,
      examType: type,
      status: { $in: ["pending", "approved"] },
    });
    if (duplicate) {
      return res.status(409).json({
        message: `${normalized} already has an active ${type} booking. Cancel it first to rebook.`,
      });
    }

    // Same-day student conflict check — enforced in backend (stop on first match).
    const hasConflict = await hasSameDayStudentConflict({
      courseCode: normalized,
      examDate: date,
    });
    if (hasConflict) {
      await AuditLog.create({
        action: "BOOKING_CONFLICT",
        user: createdBy,
        role: "coordinator",
        courseCode: normalized,
        details: `Booking conflict for ${normalized} on ${date.toISOString().slice(0, 10)}`,
      });
      return res.status(409).json({
        message: "Booking conflict detected",
        hasConflict: true,
      });
    }

    // Re-activate a previously cancelled/rejected booking doc for this (courseCode, examType).
    if (existingAnyStatus && ["cancelled", "rejected"].includes(existingAnyStatus.status)) {
      existingAnyStatus.examDate = date;
      existingAnyStatus.level = level;
      existingAnyStatus.maleProctors = maleProctors;
      existingAnyStatus.femaleProctors = femaleProctors;
      existingAnyStatus.createdBy = createdBy;
      existingAnyStatus.notes = notes;
      existingAnyStatus.status = "pending";
      await existingAnyStatus.save();

      await AuditLog.create({
        action: "CREATE_BOOKING",
        user: createdBy,
        role: "committee",
        courseCode: normalized,
        bookingId: existingAnyStatus._id,
        details: `Reactivated ${type} booking for ${normalized} on ${date.toISOString().slice(0, 10)}`,
      });

      return res.status(200).json(existingAnyStatus);
    }

    const booking = await Booking.create({
      courseCode: normalized,
      examType: type,
      examDate: date,
      level,
      maleProctors,
      femaleProctors,
      createdBy,
      notes,
      status: "pending",
    });

    await AuditLog.create({
      action: "CREATE_BOOKING",
      user: createdBy,
      role: "coordinator",
      courseCode: normalized,
      bookingId: booking._id,
      details: `Created ${type} booking for ${normalized} on ${date.toISOString().slice(0, 10)}`,
    });

    res.status(201).json(booking);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: "A booking already exists for this course and exam type",
      });
    }
    res.status(500).json({ message: err.message });
  }
});

/**
 * PUT /api/bookings/:id — reschedule / edit an existing booking.
 */
router.put("/:id", async (req, res) => {
  try {
    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Booking not found" });

    const courseCode = req.body.courseCode
      ? normalizeCourseCode(req.body.courseCode)
      : existing.courseCode;
    const examType = req.body.examType || existing.examType;

    if (!VALID_EXAM_TYPES.includes(examType)) {
      return res.status(400).json({
        message: `Invalid examType "${examType}". Must be one of: ${VALID_EXAM_TYPES.join(", ")}`,
      });
    }

    const examDate = req.body.examDate
      ? parseDateToUtcDayBounds(req.body.examDate).startOfDayUtc
      : existing.examDate;
    const level = req.body.level !== undefined ? req.body.level : existing.level;
    const maleProctors = req.body.maleProctors !== undefined ? req.body.maleProctors : existing.maleProctors;
    const femaleProctors = req.body.femaleProctors !== undefined ? req.body.femaleProctors : existing.femaleProctors;
    const updatedBy = req.body.updatedBy || existing.createdBy || "unknown";

    if (!courseCode || !examDate || level === undefined || level === null) {
      return res.status(400).json({ message: "courseCode, examDate, and level are required" });
    }

    // Duplicate guard — same course + same type, excluding this booking.
    const otherForCourse = await Booking.findOne({
      _id: { $ne: existing._id },
      courseCode,
      examType,
      status: { $in: ["pending", "approved"] },
    }).select("_id");
    if (otherForCourse) {
      return res.status(409).json({
        message: `An active ${examType} booking already exists for ${courseCode}`,
      });
    }

    // Same-day student conflict check — enforced in backend (stop on first match), excludes self.
    const hasConflict = await hasSameDayStudentConflict({
      courseCode,
      examDate,
      excludeBookingId: existing._id,
    });
    if (hasConflict) {
      await AuditLog.create({
        action: "BOOKING_CONFLICT",
        user: updatedBy,
        role: "coordinator",
        courseCode,
        details: `Reschedule conflict for ${courseCode} on ${examDate.toISOString().slice(0, 10)}`,
      });
      return res.status(409).json({
        message: "Booking conflict detected",
        hasConflict: true,
      });
    }

    const oldSnapshot = { examType: existing.examType, examDate: existing.examDate };

    // If switching modes, cancel any other active bookings for this course
    // in the opposite mode. Do NOT cancel when switching Major 1 ↔ Major 2.
    const oldMode = examMode(existing.examType);
    const newMode = examMode(examType);
    if (oldMode !== newMode) {
      await Booking.updateMany(
        {
          _id: { $ne: existing._id },
          courseCode,
          status: { $in: ["pending", "approved"] },
        },
        { $set: { status: "cancelled" } }
      );
    }

    existing.courseCode = courseCode;
    existing.examType = examType;
    existing.examDate = examDate;
    existing.level = level;
    existing.maleProctors = maleProctors;
    existing.femaleProctors = femaleProctors;
    await existing.save();

    await AuditLog.create({
      action: "RESCHEDULE_BOOKING",
      user: updatedBy,
      role: req.body.role || "coordinator",
      courseCode,
      bookingId: existing._id,
      details: `Rescheduled ${courseCode}: ${oldSnapshot.examType} ${oldSnapshot.examDate.toISOString().slice(0, 10)} → ${examType} ${examDate.toISOString().slice(0, 10)}`,
      metadata: { old: oldSnapshot, new: { examType, examDate } },
    });

    res.json(existing);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "A booking already exists for this course and exam type" });
    }
    res.status(500).json({ message: err.message });
  }
});

/**
 * DELETE /api/bookings/:id — soft-cancel (sets status = "cancelled").
 * Preserves the document for audit trail. Cancelled bookings are excluded
 * from conflict checks and GET /api/bookings.
 */
router.delete("/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = "cancelled";
    await booking.save();

    await AuditLog.create({
      action: "CANCEL_BOOKING",
      user: req.body?.user || booking.createdBy || "unknown",
      role: req.body?.role || "coordinator",
      courseCode: booking.courseCode,
      bookingId: booking._id,
      details: `Cancelled ${booking.examType} booking for ${booking.courseCode}`,
    });

    res.json({ message: "Booking cancelled", booking });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
