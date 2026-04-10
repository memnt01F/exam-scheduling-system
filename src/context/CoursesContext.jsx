import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { coordinatorCourses as initialCourses, generateExamSlots, phases as initialPhases, formatSlotDate as staticFormatSlotDate, weekStartDates as defaultWeekStartDates, blockedDates as defaultBlockedDates, getSlotDate as staticGetSlotDate } from '../lib/mock-data.js';
import { anchorEligibleCourses } from '../lib/anchor-courses.js';
import { auditLogs as initialAuditLogs, allUsers as initialUsers, academicTerms as initialTerms } from '../lib/mock-admin-data.js';

const CoursesContext = createContext(null);

let auditIdCounter = initialAuditLogs.length + 1;

/**
 * Build a toDateKey helper.
 */
function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Generate exam slots dynamically from weekStartDates and blockedDates.
 */
function buildExamSlots(weekStarts, blocked) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
  return weekStarts.map((startStr, weekIdx) => {
    const week = weekIdx + 1;
    return dayNames.map((dayName, dayIdx) => {
      const day = dayIdx + 1;
      const start = new Date(startStr + 'T00:00:00');
      start.setDate(start.getDate() + dayIdx);
      const dateStr = toDateKey(start);
      const blockReason = blocked[dateStr] || undefined;
      return {
        week,
        day,
        dayName,
        date: dateStr,
        dateLabel: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isBlocked: !!blockReason,
        blockReason,
        bookedCourses: [],
      };
    });
  });
}

export const CoursesProvider = ({ children }) => {
  // Merge coordinator courses with anchor-eligible courses (avoid duplicates by code)
  const mergedInitialCourses = (() => {
    const existing = new Set(initialCourses.map(c => c.code.replace(/\s+/g, '')));
    const anchorCourses = anchorEligibleCourses
      .filter(ac => !existing.has(ac.code.replace(/\s+/g, '')))
      .map((ac, idx) => ({
        id: `anchor-${idx}`,
        code: ac.code,
        name: ac.name,
        level: 1,
        department: ac.department || 'General Studies',
        bookings: {},
      }));
    return [...initialCourses.map(c => ({ ...c, bookings: { ...c.bookings } })), ...anchorCourses];
  })();

  const [courses, setCourses] = useState(mergedInitialCourses);
  const [examSlots, setExamSlots] = useState(generateExamSlots);
  const [phases, setPhases] = useState(initialPhases.map(p => ({ ...p })));
  const [auditLogs, setAuditLogs] = useState([...initialAuditLogs]);
  const [users, setUsers] = useState(initialUsers.map(u => ({ ...u, assignedCourses: u.assignedCourses || [] })));
  const [academicTerms, setAcademicTerms] = useState(initialTerms.map(t => ({ ...t })));

  // Active term calendar data — when null, use defaults from mock-data.js
  const [activeTermCalendar, setActiveTermCalendar] = useState(null);

  // Derived: effective calendar data
  const effectiveWeekStartDates = activeTermCalendar?.weekStartDates || defaultWeekStartDates;
  const effectiveBlockedDates = activeTermCalendar?.blockedDates || defaultBlockedDates;
  const effectiveTermStart = activeTermCalendar?.termStart || '2026-01-11';
  const effectiveTermEnd = activeTermCalendar?.termEnd || '2026-05-21';

  // Helper functions that use the effective calendar
  const getSlotDate = useCallback((week, day) => {
    const startStr = effectiveWeekStartDates[week - 1];
    if (!startStr) return null;
    const start = new Date(startStr + 'T00:00:00');
    start.setDate(start.getDate() + (day - 1));
    return start;
  }, [effectiveWeekStartDates]);

  const formatSlotDate = useCallback((week, day) => {
    const d = getSlotDate(week, day);
    if (!d) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [getSlotDate]);

  /**
   * Activate a term's calendar data and regenerate exam slots.
   */
  const activateTermCalendar = useCallback((calendarData) => {
    if (!calendarData) {
      setActiveTermCalendar(null);
      setExamSlots(generateExamSlots);
      return;
    }
    setActiveTermCalendar(calendarData);
    const newSlots = buildExamSlots(calendarData.weekStartDates, calendarData.blockedDates);
    setExamSlots(newSlots);
  }, []);

  const addAuditLog = useCallback(({ action, user, course, details }) => {
    const entry = {
      id: `a${auditIdCounter++}`,
      action,
      user: user || 'System',
      course: course || '—',
      details: details || '',
      timestamp: new Date().toISOString(),
    };
    setAuditLogs(prev => [entry, ...prev]);
  }, []);

  const updatePhases = (newPhases) => {
    setPhases(newPhases.map(p => ({ ...p })));
  };

  const bookCourse = ({ courseId, examType, week, day, maleProctors, femaleProctors, userName }) => {
    const oldCourse = courses.find(c => c.id === courseId);
    const isReschedule = !!(oldCourse?.bookings[examType]);
    const courseCode = oldCourse?.code || '';
    const dateLabel = formatSlotDate(week, day);

    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      const newBookings = { ...c.bookings };
      newBookings[examType] = {
        week, day, maleProctors, femaleProctors,
        bookedAt: new Date().toISOString(),
      };
      return { ...c, bookings: newBookings };
    }));

    setExamSlots(prev => {
      const newSlots = prev.map(weekSlots => weekSlots.map(slot => ({ ...slot, bookedCourses: [...slot.bookedCourses] })));
      const oldBooking = oldCourse?.bookings[examType];
      if (oldBooking?.week && oldBooking?.day) {
        const oldSlot = newSlots[oldBooking.week - 1]?.[oldBooking.day - 1];
        if (oldSlot) oldSlot.bookedCourses = oldSlot.bookedCourses.filter(code => code !== oldCourse.code);
      }
      const newSlot = newSlots[week - 1]?.[day - 1];
      if (newSlot && !newSlot.bookedCourses.includes(courseCode)) newSlot.bookedCourses.push(courseCode);
      return newSlots;
    });

    if (isReschedule) {
      const oldB = oldCourse.bookings[examType];
      const oldDate = formatSlotDate(oldB.week, oldB.day);
      addAuditLog({ action: 'booking_rescheduled', user: userName || 'Unknown', course: courseCode, details: `${examType} moved from Week ${oldB.week}, ${oldDate} to Week ${week}, ${dateLabel}` });
    } else {
      addAuditLog({ action: 'booking_created', user: userName || 'Unknown', course: courseCode, details: `Booked ${examType} — Week ${week}, ${dateLabel}` });
    }
  };

  const cancelBooking = (courseId, examType, userName) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    const booking = course.bookings[examType];

    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      const newBookings = { ...c.bookings };
      delete newBookings[examType];
      return { ...c, bookings: newBookings };
    }));

    if (booking?.week && booking?.day) {
      setExamSlots(prev => {
        const newSlots = prev.map(weekSlots => weekSlots.map(slot => ({ ...slot, bookedCourses: [...slot.bookedCourses] })));
        const slot = newSlots[booking.week - 1]?.[booking.day - 1];
        if (slot) slot.bookedCourses = slot.bookedCourses.filter(code => code !== course.code);
        return newSlots;
      });
    }

    const dateLabel = booking?.week ? `Week ${booking.week}, ${formatSlotDate(booking.week, booking.day)}` : '';
    addAuditLog({ action: 'booking_deleted', user: userName || 'Unknown', course: course.code, details: `Deleted ${examType} booking${dateLabel ? ` — ${dateLabel}` : ''}` });
  };

  const addCourse = (course) => {
    setCourses(prev => [...prev, { ...course, bookings: course.bookings || {} }]);
  };

  const removeCourse = (courseId) => {
    setCourses(prev => prev.filter(c => c.id !== courseId));
  };

  // Anchor slots state — term-specific records created by the committee
  const [anchorSlots, setAnchorSlots] = useState([]);

  const addAnchorSlot = useCallback((slot) => {
    const record = {
      id: `anchor-${Date.now()}`,
      termId: slot.termId || 'current',
      courseCode: slot.courseCode,
      courseName: slot.courseName,
      examType: slot.examType,
      week: slot.week,
      date: slot.date,
      bookingStatus: 'booked',
      updatedBy: slot.createdBy || 'Committee',
      updatedAt: new Date().toISOString(),
    };
    // Replace existing slot for this course, or add new
    setAnchorSlots(prev => {
      const filtered = prev.filter(s => s.courseCode !== slot.courseCode);
      return [...filtered, record];
    });
    addAuditLog({
      action: 'level1_configured',
      user: slot.createdBy || 'Committee',
      course: slot.courseCode,
      details: `Booked ${slot.examType} — Week ${slot.week}, ${slot.date}`,
    });
    return { success: true };
  }, [addAuditLog]);

  const removeAnchorSlot = useCallback((slotId) => {
    setAnchorSlots(prev => prev.filter(s => s.id !== slotId));
  }, []);

  /**
   * Check if a course (optionally + examType) is committee-fixed.
   */
  const isAnchored = useCallback((courseCode, examType) => {
    return anchorSlots.some(s => s.courseCode === courseCode && (!examType || s.examType === examType));
  }, [anchorSlots]);

  const value = {
    courses, examSlots, phases, auditLogs, users, setUsers,
    academicTerms, setAcademicTerms,
    activeTermCalendar, activateTermCalendar,
    effectiveWeekStartDates, effectiveBlockedDates, effectiveTermStart, effectiveTermEnd,
    getSlotDate, formatSlotDate,
    updatePhases, bookCourse, cancelBooking, addCourse, removeCourse, addAuditLog,
    anchorSlots, addAnchorSlot, removeAnchorSlot, isAnchored,
  };

  return (
    <CoursesContext.Provider value={value}>
      {children}
    </CoursesContext.Provider>
  );
};

export const useCourses = () => {
  const ctx = useContext(CoursesContext);
  if (!ctx) return {
    courses: [], examSlots: [], phases: [], auditLogs: [], users: [], setUsers: () => {},
    academicTerms: [], setAcademicTerms: () => {},
    activeTermCalendar: null, activateTermCalendar: () => {},
    effectiveWeekStartDates: defaultWeekStartDates, effectiveBlockedDates: defaultBlockedDates,
    effectiveTermStart: '2026-01-11', effectiveTermEnd: '2026-05-21',
    getSlotDate: staticGetSlotDate, formatSlotDate: staticFormatSlotDate,
    updatePhases: () => {}, bookCourse: () => {}, cancelBooking: () => {}, addAuditLog: () => {},
    anchorSlots: [], addAnchorSlot: () => ({ success: false }), removeAnchorSlot: () => {}, isAnchored: () => false,
  };
  return ctx;
};
