/**
 * Booking routes — GET, POST, PUT, DELETE + algorithm routes.
 *
 * Phase 2 manual bookings: phaseNumber is 2.
 * Algorithm-generated exams (Phase 0/1): phaseNumber is 0 or 1, termId is set.
 *
 * GET  /            — list bookings (see query params below)
 * POST /check-conflict — preview conflicts without creating
 * POST /confirm     — confirm all algorithm exams for a term+phase
 * POST /bulk        — bulk-insert algorithm exams (replaces previous for that term+phase)
 * POST /            — create a Phase 2 manual booking
 * PUT  /:id         — edit a booking (algorithm or Phase 2, with appropriate validation)
 * DELETE /:id       — soft-cancel
 */
const express = require("express");
const Booking = require("../models/booking.model");
const CoursePreference = require("../models/coursePreference.model");
const AuditLog = require("../models/auditLog.model");
const AcademicTerm = require("../models/academicTerm.model");
const { hasSameDayStudentConflict, normalizeCourseCode, parseDateToUtcDayBounds } = require("../services/conflictService");

const router = express.Router();

const VALID_EXAM_TYPES = ["Major 1", "Major 2", "Major 3", "Mid"];
const examMode = (t) => (t === "Mid" ? "mid" : "major");

/**
 * GET /api/bookings
 * - No params: Phase 2 manual bookings only (phaseNumber is 2)
 * - ?phaseNumber=0&termId=xxx: algorithm exams for that phase + term
 */
router.get("/", async (req, res) => {
  try {
    const { termId, phaseNumber } = req.query;
    const query = { status: { $in: ["pending", "confirmed"] } };

    if (phaseNumber !== undefined) {
      query.phaseNumber = Number(phaseNumber);
    } else if (!termId) {
      // No term specified = initial context load; return phase 2 only to avoid
      // pulling thousands of algorithm-generated bookings on app startup.
      query.phaseNumber = 2;
    }
    // termId provided without phaseNumber → return all phases for that term (admin view)
    if (termId) query.termId = termId;

    const bookings = await Booking.find(query).sort({ examDate: 1 });
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

    res.json({ hasConflict });
  } catch (err) {
    if (err?.code === "INVALID_EXAM_DATE") {
      return res.status(400).json({ message: "Invalid examDate" });
    }
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/bookings/confirm — confirm all algorithm exams for a term + phase.
 * Sets confirmedAt / confirmedBy on matched bookings and flips CoursePreference status → 'scheduled'.
 */
router.post("/confirm", async (req, res) => {
  try {
    const { termId, phaseNumber, confirmedBy } = req.body || {};
    if (!termId || phaseNumber === undefined || phaseNumber === null) {
      return res.status(400).json({ message: "termId and phaseNumber are required" });
    }
    const phaseNum = Number(phaseNumber);
    const now = new Date();

    const result = await Booking.updateMany(
      { termId, phaseNumber: phaseNum, status: { $in: ["pending", "confirmed"] } },
      { $set: { confirmedAt: now, confirmedBy: confirmedBy || "admin", status: "confirmed" } }
    );

    // Flip matching CoursePreference records to 'scheduled'
    const confirmed = await Booking.find({ termId, phaseNumber: phaseNum }).select("courseCode");
    const courseCodes = [...new Set(confirmed.map((b) => b.courseCode))];
    if (courseCodes.length > 0) {
      await CoursePreference.updateMany(
        { termId, courseCode: { $in: courseCodes } },
        { $set: { status: "scheduled" } }
      );
    }

    res.json({ confirmed: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/bookings/bulk — bulk-insert algorithm-generated exams.
 * Cancels any existing algorithm exams for the same term + phase before inserting.
 * Body: { termId, phaseNumber, exams: [{ courseCode, examType, examDate, room? }] }
 */
router.post("/bulk", async (req, res) => {
  try {
    const { termId, phaseNumber, exams } = req.body || {};
    if (!termId || phaseNumber === undefined || !Array.isArray(exams)) {
      return res.status(400).json({ message: "termId, phaseNumber, and exams array are required" });
    }
    const phaseNum = Number(phaseNumber);

    // Soft-cancel previous algorithm exams for this term + phase (Regenerate flow)
    await Booking.updateMany(
      { termId, phaseNumber: phaseNum },
      { $set: { status: "cancelled" } }
    );

    const docs = exams.map((e) => ({
      courseCode: normalizeCourseCode(e.courseCode),
      examType: e.examType || "Major 1",
      examDate: parseDateToUtcDayBounds(e.examDate).startOfDayUtc,
      phaseNumber: phaseNum,
      termId,
      room: e.room || "",
      status: "pending",
    }));

    const created = await Booking.insertMany(docs);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** POST /api/bookings — create a Phase 2 manual booking. */
router.post("/", async (req, res) => {
  try {
    const {
      courseCode, examDate, level,
      maleProctors = 0, femaleProctors = 0,
      createdBy, examType, notes, termId, status,
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

    // If a Phase 2 booking exists for (courseCode, examType) but was previously cancelled/rejected,
    // reuse it instead of inserting a new document.
    const existingAnyStatus = await Booking.findOne({
      courseCode: normalized,
      examType: type,
      phaseNumber: 2,
    });

    // Enforce Mid ↔ Major exclusivity for Phase 2 bookings.
    const activeForCourse = await Booking.find({
      courseCode: normalized,
      phaseNumber: 2,
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

    // Duplicate guard: same course + same type already active (Phase 2 only).
    const duplicate = await Booking.findOne({
      courseCode: normalized,
      examType: type,
      phaseNumber: 2,
      status: { $in: ["pending", "approved"] },
    });
    if (duplicate) {
      return res.status(409).json({
        message: `${normalized} already has an active ${type} booking. Cancel it first to rebook.`,
      });
    }

    // Same-day student conflict check (checks ALL active bookings, including algorithm exams).
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

    // Re-activate a previously cancelled/rejected Phase 2 booking.
    if (existingAnyStatus && ["cancelled", "rejected"].includes(existingAnyStatus.status)) {
      existingAnyStatus.examDate = date;
      existingAnyStatus.level = level;
      existingAnyStatus.maleProctors = maleProctors;
      existingAnyStatus.femaleProctors = femaleProctors;
      existingAnyStatus.createdBy = createdBy;
      existingAnyStatus.notes = notes;
      existingAnyStatus.termId = termId || null;
      existingAnyStatus.status = status || "pending";
      await existingAnyStatus.save();

      await AuditLog.create({
        action: "CREATE_BOOKING",
        user: createdBy,
        role: "deptHead",
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
      termId: termId || null,
      status: status || "pending",
      phaseNumber: 2,
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
 * PUT /api/bookings/:id — edit a booking.
 * - Algorithm exams (phaseNumber 0/1): update examDate + room only, with conflict check.
 * - Phase 2 manual bookings: full reschedule logic with duplicate guard + mode switching.
 */
router.put("/:id", async (req, res) => {
  try {
    const existing = await Booking.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Booking not found" });

    // ── Algorithm exam branch ──
    if (existing.phaseNumber !== 2) {
      const newExamDate = req.body.examDate
        ? parseDateToUtcDayBounds(req.body.examDate).startOfDayUtc
        : existing.examDate;

      // Check blocked dates from the term's calendarData
      if (req.body.examDate && existing.termId) {
        const termDoc = await AcademicTerm.findById(existing.termId).select("calendarData");
        const blockedDates = termDoc?.calendarData?.blockedDates || {};
        const dateKey = newExamDate.toISOString().slice(0, 10);
        if (blockedDates[dateKey]) {
          return res.status(409).json({ message: `Cannot schedule on a blocked date: ${blockedDates[dateKey]}` });
        }
      }

      const hasConflict = await hasSameDayStudentConflict({
        courseCode: existing.courseCode,
        examDate: newExamDate,
        excludeBookingId: existing._id,
      });
      if (hasConflict) {
        return res.status(409).json({ message: "Booking conflict detected", hasConflict: true });
      }

      existing.examDate = newExamDate;
      if (req.body.room !== undefined) existing.room = req.body.room;
      if (req.body.updatedBy) existing.updatedBy = req.body.updatedBy;
      await existing.save();
      return res.json(existing);
    }

    // ── Phase 2 manual booking branch ──
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

    // Duplicate guard — same course + same type (Phase 2 only), excluding this booking.
    const otherForCourse = await Booking.findOne({
      _id: { $ne: existing._id },
      courseCode,
      examType,
      phaseNumber: 2,
      status: { $in: ["pending", "approved"] },
    }).select("_id");
    if (otherForCourse) {
      return res.status(409).json({
        message: `An active ${examType} booking already exists for ${courseCode}`,
      });
    }

    // Same-day conflict check (includes algorithm exams on the same day).
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

    // Cancel opposite-mode Phase 2 bookings if switching Mid ↔ Major.
    const oldMode = examMode(existing.examType);
    const newMode = examMode(examType);
    if (oldMode !== newMode) {
      await Booking.updateMany(
        {
          _id: { $ne: existing._id },
          courseCode,
          phaseNumber: 2,
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
 * Works for both Phase 2 manual bookings and algorithm-generated exams.
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
