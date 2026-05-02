const Enrollment = require("../models/enrollment.model");
const Booking = require("../models/booking.model");

function normalizeCourseCode(courseCode) {
  return String(courseCode || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function parseDateToUtcDayBounds(examDate) {
  const raw = String(examDate || "").trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const date = isDateOnly ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const err = new Error("Invalid examDate");
    err.code = "INVALID_EXAM_DATE";
    throw err;
  }

  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);

  return { startOfDayUtc: start, endOfDayUtc: end };
}

async function hasSameDayStudentConflict({ courseCode, examDate, excludeBookingId } = {}) {
  const normalized = normalizeCourseCode(courseCode);
  const { startOfDayUtc, endOfDayUtc } = parseDateToUtcDayBounds(examDate);

  // Students enrolled in the proposed course.
  const selectedStudentIds = await Enrollment.distinct("studentId", { courseCode: normalized });
  if (!selectedStudentIds.length) return false;

  // Active bookings on the same UTC day (pending/approved), excluding self booking if provided.
  const sameDayQuery = {
    examDate: { $gte: startOfDayUtc, $lte: endOfDayUtc },
    status: { $in: ["pending", "approved"] },
  };
  if (excludeBookingId) sameDayQuery._id = { $ne: excludeBookingId };

  const bookedCourseCodes = (
    await Booking.distinct("courseCode", sameDayQuery)
  ).filter((c) => normalizeCourseCode(c) !== normalized);

  if (!bookedCourseCodes.length) return false;

  // Early exit: find ONE enrollment where student is in the selected course AND course is booked same-day.
  const hit = await Enrollment.findOne({
    studentId: { $in: selectedStudentIds },
    courseCode: { $in: bookedCourseCodes.map(normalizeCourseCode) },
  }).select("_id");

  return !!hit;
}

module.exports = {
  normalizeCourseCode,
  parseDateToUtcDayBounds,
  hasSameDayStudentConflict,
};
