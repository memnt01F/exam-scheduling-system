export const currentUser = {
  id: 'u1',
  name: 'Dr. Ahmed Al-Rashid',
  email: 'arashid@kfupm.edu.sa',
  role: 'coordinator',
};

// Term 252 academic calendar week start dates (Sunday-based)
export const weekStartDates = [
  '2026-01-11', // Week 1
  '2026-01-18', // Week 2
  '2026-01-25', // Week 3
  '2026-02-01', // Week 4
  '2026-02-08', // Week 5
  '2026-02-15', // Week 6
  '2026-02-22', // Week 7
  '2026-03-01', // Week 8
  '2026-03-08', // Week 9
  // — Eid Al-Fitr break Mar 15–26 —
  '2026-03-29', // Week 10
  '2026-04-05', // Week 11
  '2026-04-12', // Week 12
  '2026-04-19', // Week 13
  '2026-04-26', // Week 14
  '2026-05-03', // Week 15
  '2026-05-10', // Week 16 (last day of classes Sun May 10)
];

export const termStart = '2026-01-11';
export const termEnd = '2026-05-21';
export const finalsStart = '2026-05-11';
export const finalsEnd = '2026-05-20';

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

/**
 * Convert a date string (YYYY-MM-DD) to week/day coordinates.
 * Returns null if the date is not a valid teaching day.
 */
export function dateToWeekDay(dateStr) {
  for (let w = 0; w < weekStartDates.length; w++) {
    const weekStart = new Date(weekStartDates[w] + 'T00:00:00');
    for (let d = 0; d < 7; d++) {
      if (d === 5) continue; // skip Friday only
      const slotDate = new Date(weekStart);
      slotDate.setDate(slotDate.getDate() + d);
      const slotStr = toDateKey(slotDate);
      if (slotStr === dateStr) {
        return { week: w + 1, day: d + 1 };
      }
    }
  }
  return null;
}

/**
 * Blocked dates with reasons.
 * Includes: Founding Day, Eid Al-Fitr / Ramadan break, Finals period.
 */
export const blockedDates = {
  '2026-02-22': 'Saudi Founding Day',
  // Eid Al-Fitr / Ramadan break: Mar 15–26
  '2026-03-15': 'Eid Al-Fitr Break',
  '2026-03-16': 'Eid Al-Fitr Break',
  '2026-03-17': 'Eid Al-Fitr Break',
  '2026-03-18': 'Eid Al-Fitr Break',
  '2026-03-19': 'Eid Al-Fitr Break',
  '2026-03-20': 'Eid Al-Fitr Break',
  '2026-03-21': 'Eid Al-Fitr Break',
  '2026-03-22': 'Eid Al-Fitr Break',
  '2026-03-23': 'Eid Al-Fitr Break',
  '2026-03-24': 'Eid Al-Fitr Break',
  '2026-03-25': 'Eid Al-Fitr Break',
  '2026-03-26': 'Eid Al-Fitr Break',
  // Finals
  '2026-05-11': 'Final Examinations',
  '2026-05-12': 'Final Examinations',
  '2026-05-13': 'Final Examinations',
  '2026-05-14': 'Final Examinations',
  '2026-05-17': 'Final Examinations',
  '2026-05-18': 'Final Examinations',
  '2026-05-19': 'Final Examinations',
  '2026-05-20': 'Final Examinations',
};

/**
 * Map of date strings to arrays of booked course codes.
 */
export const bookedDateMap = {
  '2026-02-03': ['ICS 108'],
  '2026-02-08': ['MATH101'],
  '2026-02-09': ['PHYS101'],
  '2026-02-10': ['CHEM101'],
  '2026-02-16': ['STAT201'],
  '2026-02-18': ['MATH208'],
  '2026-02-23': ['ICS 253'],
  '2026-03-08': ['BUS200'],
  '2026-03-31': ['MATH102'],
};

export const phases = [
  {
    id: 'p0',
    name: 'Phase 0',
    description: 'Pre-configured anchor slots for Level 1 courses',
    targetLevels: [1],
    startDate: '2026-01-15',
    endDate: '2026-02-01',
    isActive: false,
  },
  {
    id: 'p1',
    name: 'Phase 1',
    description: 'Booking for Level 2 courses',
    targetLevels: [2],
    startDate: '2026-02-15',
    endDate: '2026-03-28',
    isActive: false,
  },
  {
    id: 'p2',
    name: 'Phase 2',
    description: 'Booking for Level 3 and Level 4 courses',
    targetLevels: [3, 4],
    startDate: '2026-03-29',
    endDate: '2026-04-15',
    isActive: true,
  },
];

/**
 * All available exam types a coordinator can book.
 */
export const EXAM_TYPES = ['Major 1', 'Major 2', 'Mid'];

/**
 * Courses use a `bookings` object keyed by exam type.
 * A coordinator can book any combination of Major 1, Major 2, and/or Mid.
 * Each entry: { week, day, maleProctors, femaleProctors, bookedAt }
 */
export const coordinatorCourses = [
  {
    id: 'c0',
    code: 'ICS 108',
    name: 'Introduction to Computing',
    level: 1,
    department: 'Information & Computer Science',
    bookings: {
      'Major 1': { week: 4, day: 3, maleProctors: 2, femaleProctors: 1, bookedAt: '2026-01-20T09:00:00Z' },
      'Major 2': { week: 8, day: 4, maleProctors: 2, femaleProctors: 1, bookedAt: '2026-01-22T09:00:00Z' },
    },
  },
  {
    id: 'c1',
    code: 'ICS 253',
    name: 'Discrete Structures',
    level: 2,
    department: 'Information & Computer Science',
    bookings: {
      'Major 1': { week: 7, day: 2, maleProctors: 3, femaleProctors: 2, bookedAt: '2026-03-01T10:30:00Z' },
    },
  },
  {
    id: 'c2',
    code: 'ICS 202',
    name: 'Data Structures',
    level: 2,
    department: 'Information & Computer Science',
    bookings: {},
  },
  {
    id: 'c3',
    code: 'ICS 344',
    name: 'Information Security',
    level: 3,
    department: 'Information & Computer Science',
    bookings: {},
  },
  {
    id: 'c4',
    code: 'ICS 485',
    name: 'Machine Learning',
    level: 4,
    department: 'Information & Computer Science',
    bookings: {},
  },
];

/**
 * Determine required exam types for a course based on what's been booked.
 * If any Major is booked → both Major 1 & Major 2 are required.
 * If Mid is booked → only Mid is required.
 * If nothing booked → returns all types (coordinator will choose).
 */
export function getRequiredExamTypes(course) {
  const booked = Object.keys(course.bookings || {});
  if (booked.length === 0) return EXAM_TYPES; // all options shown
  if (booked.includes('Mid')) return ['Mid'];
  return ['Major 1', 'Major 2'];
}

/**
 * Determine overall booking status.
 * 'fully_booked' = all required exam types are booked.
 * 'partially_booked' = some but not all required types booked (e.g. Major 1 without Major 2).
 * 'not_booked' = nothing booked.
 */
export function getCourseBookingStatus(course) {
  const booked = Object.keys(course.bookings || {});
  if (booked.length === 0) return 'not_booked';
  const required = getRequiredExamTypes(course);
  const bookedCount = required.filter(t => course.bookings[t]).length;
  if (bookedCount >= required.length) return 'fully_booked';
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
      const booked = dateStr ? (bookedDateMap[dateStr] || []) : [];
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

/**
 * Mock shared-enrollment data.
 */
const sharedEnrollment = {
  'ICS 202': [
    { course: 'MATH101', sharedStudents: 12 },
    { course: 'STAT201', sharedStudents: 8 },
    { course: 'PHYS101', sharedStudents: 5 },
  ],
  'ICS 253': [
    { course: 'MATH208', sharedStudents: 15 },
  ],
  'ICS 344': [
    { course: 'ICS 253', sharedStudents: 22 },
    { course: 'BUS200', sharedStudents: 6 },
  ],
  'ICS 485': [
    { course: 'ICS 344', sharedStudents: 18 },
    { course: 'STAT201', sharedStudents: 10 },
  ],
};

export const checkConflicts = (week, day, courseCode) => {
  const date = getSlotDate(week, day);
  if (!date) return { hasConflict: false };

  const dateStr = toDateKey(date);
  const bookedOnDate = bookedDateMap[dateStr] || [];

  const overlaps = sharedEnrollment[courseCode];
  if (!overlaps) return { hasConflict: false };

  for (const { course, sharedStudents } of overlaps) {
    if (bookedOnDate.includes(course)) {
      return {
        hasConflict: true,
        message: `Student conflict detected: ${sharedStudents} students are enrolled in both ${courseCode} and ${course}, which is already scheduled on this day.`,
      };
    }
  }

  return { hasConflict: false };
};
