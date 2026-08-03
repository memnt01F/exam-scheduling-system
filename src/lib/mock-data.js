export const weekStartDates = [];

export const termStart = null;
export const termEnd = null;

/**
 * Get the actual date for a given week and day index.
 */
export function getSlotDate(week, day) {
  const startStr = weekStartDates[week - 1];
  if (!startStr) return null;
  const start = new Date(startStr + 'T00:00:00');
  start.setDate(start.getDate() + (day - 1));
  return start;
}

export function formatSlotDate(week, day) {
  const d = getSlotDate(week, day);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const blockedDates = {};

/**
 * All available exam types a coordinator can book.
 */
export const EXAM_TYPES = ['Major 1', 'Major 2', 'Mid'];

/**
 * Determine required exam types for a course based on what's been booked.
 * If any Major is booked → both Major 1 & Major 2 are required.
 * If Mid is booked → only Mid is required.
 * If nothing booked → returns all types (coordinator will choose).
 */
export function getRequiredExamTypes(course) {
  const bookings = course?.bookings || {};
  const hasMid = !!bookings.Mid;
  const hasMajor1 = !!bookings['Major 1'];
  const hasMajor2 = !!bookings['Major 2'];

  if (hasMid) return ['Mid'];
  if (hasMajor1 || hasMajor2) return ['Major 1', 'Major 2'];
  return EXAM_TYPES; // nothing booked yet: user chooses mode
}

/**
 * Determine overall booking status.
 * Since a course can have only one exam type, 'fully_booked' if any booking exists.
 * 'not_booked' = nothing booked.
 */
export function getCourseBookingStatus(course) {
  const bookings = course?.bookings || {};
  const hasMid = !!bookings.Mid;
  const hasMajor1 = !!bookings['Major 1'];
  const hasMajor2 = !!bookings['Major 2'];

  if (!hasMid && !hasMajor1 && !hasMajor2) return 'not_booked';
  if (hasMid) return 'fully_booked';
  if (hasMajor1 && hasMajor2) return 'fully_booked';
  return 'partially_booked';
}

export const generateExamSlots = () => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

  return Array.from({ length: 16 }, (_, weekIdx) => {
    const week = weekIdx + 1;
    return dayNames.map((dayName, dayIdx) => {
      const day = dayIdx + 1;
      const date = getSlotDate(week, day);
      const dateStr = date ? toDateKey(date) : null;
      const blocked = dateStr ? blockedDates[dateStr] : undefined;
      const booked = [];
      return {
        week,
        day,
        dayName,
        date: dateStr,
        dateLabel: formatSlotDate(week, day),
        isBlocked: !!blocked,
        blockReason: blocked,
        bookedCourses: [...booked],
      };
    });
  });
};


