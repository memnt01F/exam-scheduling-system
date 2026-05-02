import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { coordinatorCourses as initialCourses, generateExamSlots, phases as initialPhases, formatSlotDate as staticFormatSlotDate, weekStartDates as defaultWeekStartDates, blockedDates as defaultBlockedDates, getSlotDate as staticGetSlotDate } from '../lib/mock-data.js';
import { anchorEligibleCourses } from '../lib/anchor-courses.js';
import { auditLogs as initialAuditLogs, allUsers as initialUsers, academicTerms as initialTerms } from '../lib/mock-admin-data.js';
import {
  getBookings, createBooking, getPhases, updatePhase,
  updateBooking as updateBookingApi, deleteBooking as deleteBookingApi,
  getUsers, createUser as createUserApi, updateUser as updateUserApi, deleteUser as deleteUserApi,
  getCourses, createCourse as createCourseApi, updateCourseApi, deleteCourseApi,
  getAuditLogs, createAuditLog,
  getTerms, createTerm, updateTermApi, deleteTermApi,
  getAnchors, createAnchor, deleteAnchorApi,
} from '../services/api.js';

const CoursesContext = createContext(null);

let auditIdCounter = initialAuditLogs.length + 1;

/**
 * Build a toDateKey helper.
 */
function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Map dateStr → { week, day } using a provided weekStartDates array.
 * Returns null if not found (non-teaching day / outside term).
 */
function dateToWeekDayFromWeekStarts(dateStr, weekStartDates) {
  for (let w = 0; w < weekStartDates.length; w++) {
    const weekStart = new Date(weekStartDates[w] + 'T00:00:00');
    for (let d = 0; d < 7; d++) {
      if (d === 5) continue; // skip Friday only
      const slotDate = new Date(weekStart);
      slotDate.setDate(slotDate.getDate() + d);
      if (toDateKey(slotDate) === dateStr) {
        return { week: w + 1, day: d + 1 };
      }
    }
  }
  return null;
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
  // Normalize course code strings to a canonical form used across the UI
  const normalizeCode = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
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

  // ─────────────── Audit logs ───────────────

  /**
   * Map UI-style action names (snake_case) to backend names (UPPER_SNAKE),
   * and back. Lets the same `addAuditLog` work for both worlds.
   */
  const UI_TO_BACKEND_ACTION = {
    booking_created: 'CREATE_BOOKING',
    booking_rescheduled: 'RESCHEDULE_BOOKING',
    booking_deleted: 'CANCEL_BOOKING',
    phase_updated: 'UPDATE_PHASE',
    phase_activated: 'UPDATE_PHASE',
    phase_deactivated: 'UPDATE_PHASE',
    user_created: 'CREATE_USER',
    user_role_changed: 'UPDATE_USER',
    user_deactivated: 'UPDATE_USER',
    user_activated: 'UPDATE_USER',
    user_deleted: 'DELETE_USER',
    level1_configured: 'CREATE_ANCHOR',
    term_created: 'CREATE_TERM',
    term_activated: 'UPDATE_TERM',
  };
  const BACKEND_TO_UI_ACTION = {
    CREATE_BOOKING: 'booking_created',
    RESCHEDULE_BOOKING: 'booking_rescheduled',
    CANCEL_BOOKING: 'booking_deleted',
    BOOKING_CONFLICT: 'booking_conflict',
    UPDATE_PHASE: 'phase_updated',
    CREATE_USER: 'user_created',
    UPDATE_USER: 'user_role_changed',
    DELETE_USER: 'user_deleted',
    CREATE_COURSE: 'course_created',
    UPDATE_COURSE: 'course_updated',
    DELETE_COURSE: 'course_deleted',
    CREATE_ANCHOR: 'level1_configured',
    DELETE_ANCHOR: 'level1_removed',
    CREATE_TERM: 'term_created',
    UPDATE_TERM: 'term_activated',
  };

  /**
   * Convert a backend AuditLog document into the shape used by the UI tables.
   */
  const normalizeServerAuditLog = useCallback((log) => ({
    id: log._id || `a${auditIdCounter++}`,
    action: BACKEND_TO_UI_ACTION[log.action] || log.action,
    user: log.user || 'System',
    course: log.courseCode || '—',
    details: log.details || '',
    timestamp: log.createdAt || new Date().toISOString(),
  }), []);

  /**
   * Add an audit log entry. Optimistically appends locally, then POSTs to
   * the backend (best-effort — silent on failure so demos still work).
   */
  const addAuditLog = useCallback(({ action, user, course, details, metadata, role }) => {
    const entry = {
      id: `a${auditIdCounter++}`,
      action,
      user: user || 'System',
      course: course || '—',
      details: details || '',
      timestamp: new Date().toISOString(),
    };
    setAuditLogs(prev => [entry, ...prev]);

    // Fire-and-forget backend write.
    const backendAction = UI_TO_BACKEND_ACTION[action] || action;
    createAuditLog({
      action: backendAction,
      user: user || 'System',
      role: role || (action?.startsWith('phase') ? 'committee' : action?.startsWith('user') || action?.startsWith('term') ? 'admin' : 'coordinator'),
      courseCode: course && course !== '—' ? course : undefined,
      details: details || '',
      metadata,
    }).catch(() => { /* no-op when backend is offline */ });
  }, []);

  /** Refresh audit logs from the backend (newest first). */
  const refreshAuditLogs = useCallback(async () => {
    try {
      const data = await getAuditLogs();
      if (Array.isArray(data)) {
        setAuditLogs(data.map(normalizeServerAuditLog));
      }
      return data;
    } catch { return null; }
  }, [normalizeServerAuditLog]);


  const updatePhases = (newPhases) => {
    setPhases(newPhases.map(p => ({ ...p })));
  };

  /**
   * Apply a backend-shaped booking record into local courses + slots state.
   * Backend record shape: { courseCode, examType?, examDate, maleProctors, femaleProctors, ... }
   */
  const applyBookingLocally = useCallback((courseId, examType, week, day, maleProctors, femaleProctors, oldBooking, courseCode) => {
    setCourses(prev => prev.map(c => {
      if (c.id !== courseId) return c;
      const newBookings = { ...(c.bookings || {}) };
      newBookings[examType] = {
        week, day, maleProctors, femaleProctors,
        bookedAt: new Date().toISOString(),
      };
      return { ...c, bookings: newBookings };
    }));

    setExamSlots(prev => {
      const newSlots = prev.map(weekSlots => weekSlots.map(slot => ({ ...slot, bookedCourses: [...slot.bookedCourses] })));
      if (oldBooking?.week && oldBooking?.day) {
        const oldSlot = newSlots[oldBooking.week - 1]?.[oldBooking.day - 1];
        if (oldSlot) oldSlot.bookedCourses = oldSlot.bookedCourses.filter(code => code !== courseCode);
      }
      const newSlot = newSlots[week - 1]?.[day - 1];
      if (newSlot && !newSlot.bookedCourses.includes(courseCode)) newSlot.bookedCourses.push(courseCode);
      return newSlots;
    });
  }, []);

  /**
   * Book (or reschedule) an exam.
   *
   * Tries the backend first (POST /api/bookings). On success, refreshes
   * bookings from GET /api/bookings and applies the change to local state.
   *
   * If the backend is unreachable (e.g. running in the hosted preview where
   * the local Express server isn't accessible), falls back to local-only
   * state so the UI continues to work for demos.
   *
   * Returns { success: true } on success, or { success: false, error } on
   * conflict / validation / server error so callers can keep the modal open.
   */
  const bookCourse = async ({ courseId, examType, week, day, maleProctors, femaleProctors, userName }) => {
    const oldCourse = courses.find(c => c.id === courseId);
    const isReschedule = !!(oldCourse?.bookings[examType]);
    const courseCode = oldCourse?.code || '';
    const dateLabel = formatSlotDate(week, day);
    const slotDate = getSlotDate(week, day);
    const examDateStr = slotDate ? `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}` : null;
    const oldBooking = oldCourse?.bookings[examType];

    // Try backend first.
    try {
      await createBooking({
        courseCode,
        examType,
        examDate: examDateStr,
        level: oldCourse?.level ?? 1,
        maleProctors: parseInt(maleProctors) || 0,
        femaleProctors: parseInt(femaleProctors) || 0,
        createdBy: userName || 'Unknown',
      });

      // Refresh authoritative booking data from server so calendars update for all users.
      try {
        await refreshBookings();
      } catch {
        applyBookingLocally(courseId, examType, week, day, parseInt(maleProctors) || 0, parseInt(femaleProctors) || 0, oldBooking, courseCode);
      }

      if (isReschedule) {
        const oldDate = formatSlotDate(oldBooking.week, oldBooking.day);
        addAuditLog({ action: 'booking_rescheduled', user: userName || 'Unknown', course: courseCode, details: `${examType} moved from Week ${oldBooking.week}, ${oldDate} to Week ${week}, ${dateLabel}` });
      } else {
        addAuditLog({ action: 'booking_created', user: userName || 'Unknown', course: courseCode, details: `Booked ${examType} — Week ${week}, ${dateLabel}` });
      }
      return { success: true };
    } catch (err) {
      // 409 conflict — surface clearly.
      if (err.status === 409) {
        const count = err.data?.conflictCount;
        const conflictCourses = err.data?.conflictingCourses;
        const desc = Array.isArray(conflictCourses) && conflictCourses.length
          ? `Conflicts with: ${conflictCourses.join(', ')}`
          : undefined;
        const msg = typeof count === 'number'
          ? `Booking conflict detected. ${count} student(s) have another exam on the same day.`
          : (err.data?.message || 'Booking conflict detected.');
        toast.error(msg, desc ? { description: desc } : undefined);
        return { success: false, error: err };
      }
      // Network/unreachable backend — fall back to local-only behavior so demo still works.
      if (err.status === undefined || err.message?.includes('Failed to fetch')) {
        applyBookingLocally(courseId, examType, week, day, parseInt(maleProctors) || 0, parseInt(femaleProctors) || 0, oldBooking, courseCode);
        if (isReschedule) {
          const oldDate = formatSlotDate(oldBooking.week, oldBooking.day);
          addAuditLog({ action: 'booking_rescheduled', user: userName || 'Unknown', course: courseCode, details: `${examType} moved from Week ${oldBooking.week}, ${oldDate} to Week ${week}, ${dateLabel} (offline)` });
        } else {
          addAuditLog({ action: 'booking_created', user: userName || 'Unknown', course: courseCode, details: `Booked ${examType} — Week ${week}, ${dateLabel} (offline)` });
        }
        return { success: true, offline: true };
      }
      // 400/500 etc.
      toast.error(err.data?.message || err.message || 'Failed to create booking');
      return { success: false, error: err };
    }
  };

  // ─────────────── Backend sync ───────────────
  const [backendOnline, setBackendOnline] = useState(false);
  // FIX (Issue 2): loading=true while initial fetch is in flight.
  // App.jsx reads this to show a spinner instead of rendering mock data.
  const [loading, setLoading] = useState(true);

  /**
   * Mirror an array of backend booking docs into local courses + slots.
   * Backend docs look like: { courseCode, examDate, examType?, maleProctors, femaleProctors, level, ... }
   */
  const applyBookingsFromServer = useCallback((serverBookings) => {
    if (!Array.isArray(serverBookings)) return;

    setCourses(prev => {
      const next = prev.map(c => ({ ...c, bookings: {} }));
      const normalizeCode = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
      const bestByCourseAndType = new Map(); // `${codeKey}__${examType}` -> bookingDoc

      for (const b of serverBookings) {
        const codeKey = normalizeCode(b.courseCode);
        const examType = b.examType || 'Major 1';
        if (!codeKey || !examType) continue;
        const key = `${codeKey}__${examType}`;
        const existing = bestByCourseAndType.get(key);
        const existingTime = existing ? new Date(existing.updatedAt || existing.createdAt).getTime() : 0;
        const currentTime = new Date(b.updatedAt || b.createdAt).getTime();
        if (!existing || currentTime >= existingTime) bestByCourseAndType.set(key, b);
      }

      for (const b of bestByCourseAndType.values()) {
        const course = next.find(c => normalizeCode(c.code) === normalizeCode(b.courseCode));
        if (!course) continue;
        const dateStr = typeof b.examDate === 'string' ? b.examDate.slice(0, 10) : null;
        const wd = dateStr ? dateToWeekDayFromWeekStarts(dateStr, effectiveWeekStartDates) : null;
        if (!wd) continue;
        const examType = b.examType || 'Major 1';
        course.bookings[examType] = {
          week: wd.week,
          day: wd.day,
          maleProctors: b.maleProctors ?? 0,
          femaleProctors: b.femaleProctors ?? 0,
          bookedAt: b.createdAt || new Date().toISOString(),
          _serverId: b._id,
        };
      }
      return next;
    });

    setExamSlots(prev => {
      const cleared = prev.map(weekSlots => weekSlots.map(slot => ({ ...slot, bookedCourses: [] })));
      for (const b of serverBookings) {
        const dateStr = typeof b.examDate === 'string' ? b.examDate.slice(0, 10) : null;
        const wd = dateStr ? dateToWeekDayFromWeekStarts(dateStr, effectiveWeekStartDates) : null;
        if (!wd) continue;
        const slot = cleared[wd.week - 1]?.[wd.day - 1];
        if (slot && !slot.bookedCourses.includes(b.courseCode)) {
          slot.bookedCourses.push(b.courseCode);
        }
      }
      return cleared;
    });
  }, [effectiveWeekStartDates]);

  const refreshBookings = useCallback(async () => {
    try {
      const data = await getBookings();
      applyBookingsFromServer(data);
      setBackendOnline(true);
      return data;
    } catch {
      setBackendOnline(false);
      return null;
    }
  }, [applyBookingsFromServer]);

  /**
   * Normalize a backend phase document into the shape used by the UI.
   * Backend gives ISO dates + `_id` + `phaseNumber`; UI wants `YYYY-MM-DD`
   * strings and a stable `id`.
   */
  const normalizeServerPhase = useCallback((p, idx) => {
    const toDateInput = (v) => {
      if (!v) return '';
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      const d = new Date(v);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const phaseNumber = typeof p.phaseNumber === 'number' ? p.phaseNumber : idx;
    return {
      id: `p${phaseNumber}`,
      _id: p._id,
      phaseNumber,
      name: p.name,
      description: p.description || '',
      targetLevels: p.targetLevels || [],
      startDate: toDateInput(p.startDate),
      endDate: toDateInput(p.endDate),
      isActive: !!p.isActive,
    };
  }, []);

  /**
   * Save all phases to the backend (PUT /api/phases/:id for each).
   * Uses `phaseNumber` as the route id (backend accepts either _id or phaseNumber).
   * Falls back silently if endpoints are missing — local state still updates.
   */
  const saveAllPhases = useCallback(async (newPhases) => {
    setPhases(newPhases.map(p => ({ ...p })));
    if (!backendOnline) return { success: true, offline: true };
    try {
      const updated = await Promise.all(newPhases.map(p => {
        const routeId = p._id || (typeof p.phaseNumber === 'number' ? p.phaseNumber : p.id);
        return updatePhase(routeId, {
          name: p.name,
          startDate: p.startDate,
          endDate: p.endDate,
          isActive: p.isActive,
          targetLevels: p.targetLevels,
          updatedBy: p.updatedBy,
          role: p.role,
        });
      }));
      // Re-hydrate local state with the server's authoritative response so
      // `_id` / normalized dates persist for subsequent saves.
      const normalized = updated
        .filter(Boolean)
        .map((p, i) => normalizeServerPhase(p, i))
        .sort((a, b) => a.phaseNumber - b.phaseNumber);
      if (normalized.length === newPhases.length) setPhases(normalized);
      return { success: true };
    } catch (err) {
      console.warn('[phases] backend save failed, using local state only:', err.message);
      return { success: true, offline: true };
    }
  }, [backendOnline, normalizeServerPhase]);

  /**
   * Normalize a backend user document into the shape expected by the UI.
   * UI uses `id` + `isActive`; backend uses `_id` + `status`.
   */
  const normalizeServerUser = useCallback((u) => ({
    id: u._id,
    _serverId: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department || '',
    assignedCourses: Array.isArray(u.assignedCourses) ? Array.from(new Set(u.assignedCourses.map((c) => normalizeCode(c)))) : [],
    isActive: u.status !== 'inactive',
  }), []);

  /** Normalize a backend course doc into the UI shape. */
  const normalizeServerCourse = useCallback((c) => ({
    id: c._id,
    _serverId: c._id,
    code: c.code,
    name: c.name,
    level: c.level,
    department: c.department,
    coordinator: c.coordinator || '',
    isActive: c.status !== 'inactive',
    bookings: {},
  }), []);

  // Initial load: hydrate from backend on mount.
  //
  // FIX (Issue 2): removed isBackendReachable() which caused a visible flash.
  // Old flow: render mock data → wait up to 1500ms → replace with real data.
  // New flow: set loading=true → fire all requests in parallel → render real
  // data once → set loading=false. No flash, half the round trips.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [bookings, serverPhases, serverUsers, serverCourses, serverLogs, serverTerms, serverAnchors] = await Promise.all([
          getBookings().catch(() => null),
          getPhases().catch(() => null),
          getUsers().catch(() => null),
          getCourses().catch(() => null),
          getAuditLogs().catch(() => null),
          getTerms().catch(() => null),
          getAnchors().catch(() => null),
        ]);
        if (cancelled) return;

        // If every request failed the backend is offline — keep mock data.
        const anySucceeded = [bookings, serverPhases, serverUsers, serverCourses, serverLogs, serverTerms, serverAnchors].some(r => r !== null);
        setBackendOnline(anySucceeded);

        if (Array.isArray(serverPhases) && serverPhases.length) {
          setPhases(serverPhases.map((p, i) => normalizeServerPhase(p, i)));
        }
        if (Array.isArray(serverUsers)) {
          setUsers(serverUsers.map(normalizeServerUser));
        }
        // FIX: removed serverCourses.length check — if backend returns empty array,
        // we should show empty, not fall back to mock data.
        if (Array.isArray(serverCourses)) {
          setCourses(serverCourses.map(normalizeServerCourse));
        }
        if (Array.isArray(serverLogs)) {
          setAuditLogs(serverLogs.map(normalizeServerAuditLog));
        }
        if (Array.isArray(serverTerms) && serverTerms.length) {
          const normalized = serverTerms.map((t) => ({
            id: t._id,
            _serverId: t._id,
            name: t.name,
            startDate: t.startDate,
            endDate: t.endDate,
            isActive: !!t.isActive,
            status: t.status || (t.isActive ? 'active' : 'upcoming'),
            calendarData: t.calendarData,
          }));
          setAcademicTerms(normalized);
          const active = normalized.find(t => t.isActive && t.calendarData);
          if (active) activateTermCalendar(active.calendarData);
        }
        if (Array.isArray(serverAnchors) && serverAnchors.length) {
          setAnchorSlots(serverAnchors.map((s) => ({
            id: s._id,
            _serverId: s._id,
            termId: s.termId || 'current',
            courseCode: s.courseCode,
            courseName: s.courseName,
            examType: s.examType,
            week: s.week,
            date: s.date,
            bookingStatus: s.bookingStatus || 'booked',
            updatedBy: s.updatedBy,
            updatedAt: s.updatedAt || new Date().toISOString(),
          })));
        }
        if (bookings) applyBookingsFromServer(bookings);
      } catch (err) {
        console.warn('[backend] initial load failed:', err.message);
        setBackendOnline(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const data = await getUsers();
      if (Array.isArray(data)) setUsers(data.map(normalizeServerUser));
      return data;
    } catch { return null; }
  }, [normalizeServerUser]);

  const refreshCourses = useCallback(async () => {
    try {
      const data = await getCourses();
      // Server-of-truth: replace local list whenever the backend returns
      // courses. Preserve any in-memory bookings keyed by course code.
      if (Array.isArray(data) && data.length) {
        setCourses(prev => {
          const norm = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
          const oldBookings = new Map(prev.map(c => [norm(c.code), c.bookings || {}]));
          return data.map(sc => {
            const merged = normalizeServerCourse(sc);
            merged.bookings = oldBookings.get(norm(sc.code)) || {};
            return merged;
          });
        });
      }
      return data;
    } catch { return null; }
  }, [normalizeServerCourse]);

  /**
   * Cancel a booking. Calls DELETE /api/bookings/:id when the booking has a
   * server id; always updates local state. Backend writes its own
   * CANCEL_BOOKING audit entry; we still call addAuditLog so the UI updates
   * immediately even before the next refresh.
   */
  const cancelBooking = useCallback(async (courseId, examType, userName, role) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return { success: false };
    const booking = course.bookings[examType];
    const serverId = booking?._serverId;

    // Local apply (optimistic)
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
    addAuditLog({
      action: 'booking_deleted',
      user: userName || 'Unknown',
      course: course.code,
      details: `Deleted ${examType} booking${dateLabel ? ` — ${dateLabel}` : ''}`,
      role: role || 'admin',
    });

    // Backend delete (best-effort).
    if (serverId && backendOnline) {
      try {
        await deleteBookingApi(serverId, { user: userName || 'Unknown', role: role || 'admin' });
        // Re-pull canonical list so other clients stay in sync.
        try { const fresh = await getBookings(); applyBookingsFromServer(fresh); } catch { /* no-op */ }
        return { success: true };
      } catch (err) {
        console.warn('[bookings] cancel failed:', err.message);
        return { success: true, offline: true };
      }
    }
    return { success: true, offline: !serverId };
  }, [courses, backendOnline, formatSlotDate, addAuditLog, applyBookingsFromServer]);


  /**
   * Add a course. Tries backend first; falls back to local-only on failure.
   */
  const addCourse = useCallback(async (course, createdBy) => {
    // Local-first apply so the UI feels instant.
    setCourses(prev => [...prev, { ...course, bookings: course.bookings || {} }]);
    if (!backendOnline) return { success: true, offline: true };
    try {
      const created = await createCourseApi({
        code: course.code,
        name: course.name,
        level: Number(course.level) || 1,
        department: course.department || 'General Studies',
        createdBy: createdBy || 'admin',
      });
      // Replace the optimistic row with the canonical server row.
      setCourses(prev => {
        const norm = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
        return prev.map(c => norm(c.code) === norm(created.code)
          ? { ...normalizeServerCourse(created), bookings: c.bookings || {} }
          : c);
      });
      return { success: true, course: created };
    } catch (err) {
      console.warn('[courses] create failed:', err.message);
      return { success: true, offline: true };
    }
  }, [backendOnline, normalizeServerCourse]);

  /** Soft-delete a course (status=inactive) on the backend, remove locally. */
  const removeCourse = useCallback(async (courseId, deletedBy) => {
    const target = courses.find(c => c.id === courseId);
    setCourses(prev => prev.filter(c => c.id !== courseId));
    if (!backendOnline || !target?._serverId) return { success: true, offline: !backendOnline };
    try {
      await deleteCourseApi(target._serverId, { deletedBy: deletedBy || 'admin' });
      return { success: true };
    } catch (err) {
      console.warn('[courses] delete failed:', err.message);
      return { success: true, offline: true };
    }
  }, [backendOnline, courses]);

  /** Update a course on the backend. */
  const updateCourse = useCallback(async (courseId, patch, updatedBy) => {
    setCourses(prev => prev.map(c => c.id === courseId ? { ...c, ...patch } : c));
    const target = courses.find(c => c.id === courseId);
    if (!backendOnline || !target?._serverId) return { success: true, offline: !backendOnline };
    try {
      const updated = await updateCourseApi(target._serverId, { ...patch, updatedBy: updatedBy || 'admin' });
      setCourses(prev => prev.map(c => c.id === courseId
        ? { ...normalizeServerCourse(updated), bookings: c.bookings || {} }
        : c));
      return { success: true };
    } catch (err) {
      console.warn('[courses] update failed:', err.message);
      return { success: true, offline: true };
    }
  }, [backendOnline, courses, normalizeServerCourse]);

  /** Add a user (backend-first). */
  const addUser = useCallback(async (user, createdBy) => {
    const optimistic = { ...user, isActive: user.isActive !== false };
    setUsers(prev => [...prev, optimistic]);
    if (!backendOnline) return { success: true, offline: true };
    try {
      // Map assigned course ids (client-side ids like 'c0') to canonical course codes
      const mappedAssigned = Array.from(new Set((user.assignedCourses || []).map((val) => {
        const raw = String(val || '').trim();
        const found = courses.find(c => String(c.id) === raw || String(c._serverId || '') === raw || String(c.code || '').replace(/\s+/g, '').toUpperCase() === raw.replace(/\s+/g, '').toUpperCase());
        const code = found ? (found.code || raw) : raw;
        return normalizeCode(code);
      })));

      const created = await createUserApi({
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department || '',
        assignedCourses: mappedAssigned,
        status: user.isActive === false ? 'inactive' : 'active',
        createdBy: createdBy || 'admin',
      });
      setUsers(prev => prev.map(u => u === optimistic ? normalizeServerUser(created) : u));
      return { success: true, user: created };
    } catch (err) {
      console.warn('[users] create failed:', err.message);
      return { success: true, offline: true };
    }
  }, [backendOnline, normalizeServerUser]);

  /** Update a user. */
  const updateUser = useCallback(async (userId, patch, updatedBy) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u));
    const target = users.find(u => u.id === userId);
    const serverId = target?._serverId || (typeof userId === 'string' && /^[a-f0-9]{24}$/i.test(userId) ? userId : null);
    if (!backendOnline || !serverId) return { success: true, offline: !backendOnline };
    try {
      // If assignedCourses is present in patch, map client ids to course codes
      const payload = { ...patch, updatedBy: updatedBy || 'admin' };
      if (Array.isArray(patch.assignedCourses)) {
        payload.assignedCourses = Array.from(new Set((patch.assignedCourses || []).map((val) => {
          const raw = String(val || '').trim();
          const found = courses.find(c => String(c.id) === raw || String(c._serverId || '') === raw || String(c.code || '').replace(/\s+/g, '').toUpperCase() === raw.replace(/\s+/g, '').toUpperCase());
          const code = found ? (found.code || raw) : raw;
          return normalizeCode(code);
        })));
      }
      if ('isActive' in patch) payload.status = patch.isActive ? 'active' : 'inactive';
      const updated = await updateUserApi(serverId, payload);
      setUsers(prev => prev.map(u => u.id === userId ? normalizeServerUser(updated) : u));
      return { success: true };
    } catch (err) {
      console.warn('[users] update failed:', err.message);
      return { success: true, offline: true };
    }
  }, [backendOnline, users, normalizeServerUser]);

  /** Delete (soft) a user. */
  const deleteUser = useCallback(async (userId, deletedBy) => {
    const target = users.find(u => u.id === userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
    const serverId = target?._serverId || (typeof userId === 'string' && /^[a-f0-9]{24}$/i.test(userId) ? userId : null);
    if (!backendOnline || !serverId) return { success: true, offline: !backendOnline };
    try {
      await deleteUserApi(serverId, { hard: true, deletedBy: deletedBy || 'admin' });
      return { success: true };
    } catch (err) {
      console.warn('[users] delete failed:', err.message);
      return { success: true, offline: true };
    }
  }, [backendOnline, users]);

  /**
   * Reschedule an existing booking via PUT /api/bookings/:id when possible.
   * Falls back to bookCourse() (local create) when no server id is known.
   */
  const rescheduleBooking = useCallback(async ({ courseId, oldExamType, newExamType, week, day, maleProctors, femaleProctors, userName, role }) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return { success: false };
    const oldBooking = course.bookings[oldExamType];
    const slotDate = getSlotDate(week, day);
    const examDateStr = slotDate
      ? `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`
      : null;

    // If we don't have a server id, just create a fresh booking — the server
    // will store it and the old local-only entry will be overwritten on refresh.
    if (!oldBooking?._serverId || !backendOnline) {
      // Remove old type locally so calendar updates correctly when type changed.
      if (oldExamType !== newExamType) {
        setCourses(prev => prev.map(c => {
          if (c.id !== courseId) return c;
          const nb = { ...c.bookings };
          delete nb[oldExamType];
          return { ...c, bookings: nb };
        }));
      }
      return await bookCourse({
        courseId, examType: newExamType, week, day,
        maleProctors, femaleProctors, userName,
      });
    }

    try {
      await updateBookingApi(oldBooking._serverId, {
        courseCode: course.code,
        examType: newExamType,
        examDate: examDateStr,
        level: course.level,
        maleProctors: parseInt(maleProctors) || 0,
        femaleProctors: parseInt(femaleProctors) || 0,
        updatedBy: userName || 'Unknown',
        role: role || 'coordinator',
      });
      // Update local state immediately to reflect the change
      setCourses(prev => prev.map(c => {
        if (c.id !== courseId) return c;
        const nb = { ...c.bookings };
        delete nb[oldExamType];
        nb[newExamType] = {
          week,
          day,
          maleProctors: parseInt(maleProctors) || 0,
          femaleProctors: parseInt(femaleProctors) || 0,
          bookedAt: new Date().toISOString(),
          _serverId: oldBooking._serverId,
        };
        return { ...c, bookings: nb };
      }));
      // Refresh canonical bookings from server.
      try {
        const fresh = await getBookings();
        applyBookingsFromServer(fresh);
      } catch { /* no-op */ }

      const dateLabel = formatSlotDate(week, day);
      addAuditLog({
        action: 'booking_rescheduled',
        user: userName || 'Unknown',
        course: course.code,
        details: `${oldExamType} → ${newExamType} on Week ${week}, ${dateLabel}`,
      });
      return { success: true };
    } catch (err) {
      if (err.status === 409) {
        const count = err.data?.conflictCount;
        const conflicts = err.data?.conflictingCourses;
        const desc = Array.isArray(conflicts) && conflicts.length
          ? `Conflicts with: ${conflicts.join(', ')}`
          : undefined;
        const msg = typeof count === 'number'
          ? `Booking conflict detected. ${count} student(s) have another exam on the same day.`
          : (err.data?.message || 'Booking conflict detected.');
        toast.error(msg, desc ? { description: desc } : undefined);
        return { success: false, error: err };
      }
      toast.error(err.data?.message || err.message || 'Failed to reschedule booking');
      return { success: false, error: err };
    }
  }, [courses, backendOnline, getSlotDate, formatSlotDate, applyBookingsFromServer, addAuditLog]);

  // Anchor slots state — term-specific records created by the committee
  const [anchorSlots, setAnchorSlots] = useState([]);

  const normalizeServerAnchor = useCallback((s) => ({
    id: s._id,
    _serverId: s._id,
    termId: s.termId || 'current',
    courseCode: s.courseCode,
    courseName: s.courseName,
    examType: s.examType,
    week: s.week,
    date: s.date,
    bookingStatus: s.bookingStatus || 'booked',
    updatedBy: s.updatedBy,
    updatedAt: s.updatedAt || new Date().toISOString(),
  }), []);

  const refreshAnchors = useCallback(async () => {
    try {
      const data = await getAnchors();
      if (Array.isArray(data)) setAnchorSlots(data.map(normalizeServerAnchor));
      return data;
    } catch { return null; }
  }, [normalizeServerAnchor]);

  /**
   * Persist a committee-fixed anchor slot. Optimistically replaces the local
   * slot for the same course code, then upserts to the backend.
   */
  const addAnchorSlot = useCallback(async (slot) => {
    const optimistic = {
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
    // FIX: was filtering by courseCode alone which wiped all exam types for that course.
    // Now filters by both courseCode AND examType so Major 1 and Major 2 coexist.
    setAnchorSlots(prev => [
      ...prev.filter(s => !(s.courseCode === slot.courseCode && s.examType === slot.examType)),
      optimistic,
    ]);
    addAuditLog({
      action: 'level1_configured',
      user: slot.createdBy || 'Committee',
      course: slot.courseCode,
      details: `Booked ${slot.examType} — Week ${slot.week}, ${slot.date}`,
      role: 'committee',
    });

    if (!backendOnline) return { success: true, offline: true };
    try {
      const created = await createAnchor({
        termId: optimistic.termId,
        courseCode: optimistic.courseCode,
        courseName: optimistic.courseName,
        examType: optimistic.examType,
        week: optimistic.week,
        date: optimistic.date,
        updatedBy: optimistic.updatedBy,
      });
      // Same fix on server response — only replace the matching examType
      setAnchorSlots(prev => [
        ...prev.filter(s => !(s.courseCode === created.courseCode && s.examType === created.examType)),
        normalizeServerAnchor(created),
      ]);
      return { success: true };
    } catch (err) {
      console.warn('[anchors] create failed:', err.message);
      return { success: true, offline: true };
    }
  }, [addAuditLog, backendOnline, normalizeServerAnchor]);

  const removeAnchorSlot = useCallback(async (slotId) => {
    const target = anchorSlots.find(s => s.id === slotId);
    setAnchorSlots(prev => prev.filter(s => s.id !== slotId));
    if (!backendOnline || !target?._serverId) return { success: true, offline: !backendOnline };
    try {
      await deleteAnchorApi(target._serverId, { deletedBy: 'Committee' });
      return { success: true };
    } catch (err) {
      console.warn('[anchors] delete failed:', err.message);
      return { success: true, offline: true };
    }
  }, [anchorSlots, backendOnline]);

  /**
   * Check if a course (optionally + examType) is committee-fixed.
   */
  const isAnchored = useCallback((courseCode, examType) => {
    return anchorSlots.some(s => s.courseCode === courseCode && (!examType || s.examType === examType));
  }, [anchorSlots]);

  // ─────────────── Academic terms (backend-backed) ───────────────

  const normalizeServerTerm = useCallback((t) => ({
    id: t._id,
    _serverId: t._id,
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    isActive: !!t.isActive,
    status: t.status || (t.isActive ? 'active' : 'upcoming'),
    calendarData: t.calendarData,
  }), []);

  const refreshTerms = useCallback(async () => {
    try {
      const data = await getTerms();
      if (Array.isArray(data)) setAcademicTerms(data.map(normalizeServerTerm));
      return data;
    } catch { return null; }
  }, [normalizeServerTerm]);

  const addAcademicTerm = useCallback(async (term, createdBy) => {
    const optimistic = { ...term, id: term.id || `t-${Date.now()}` };
    setAcademicTerms(prev => {
      if (optimistic.isActive) {
        return [...prev.map(t => ({ ...t, isActive: false, status: t.status === 'active' ? 'past' : t.status })), optimistic];
      }
      return [...prev, optimistic];
    });
    if (optimistic.calendarData && optimistic.isActive) {
      activateTermCalendar(optimistic.calendarData);
    }
    addAuditLog({
      action: 'term_created',
      user: createdBy || 'Admin',
      details: `Created term ${optimistic.name} (${optimistic.status || (optimistic.isActive ? 'active' : 'upcoming')})`,
      role: 'admin',
    });
    if (!backendOnline) return { success: true, offline: true };
    try {
      const created = await createTerm({
        name: optimistic.name,
        startDate: optimistic.startDate,
        endDate: optimistic.endDate,
        isActive: optimistic.isActive,
        status: optimistic.status,
        calendarData: optimistic.calendarData,
        createdBy: createdBy || 'Admin',
      });
      // Replace optimistic row with server row.
      setAcademicTerms(prev => prev.map(t => t.id === optimistic.id ? normalizeServerTerm(created) : t));
      return { success: true, term: created };
    } catch (err) {
      console.warn('[terms] create failed:', err.message);
      return { success: true, offline: true };
    }
  }, [activateTermCalendar, addAuditLog, backendOnline, normalizeServerTerm]);

  const value = {
    courses, examSlots, phases, auditLogs, users, setUsers,
    academicTerms, setAcademicTerms, addAcademicTerm, refreshTerms,
    activeTermCalendar, activateTermCalendar,
    effectiveWeekStartDates, effectiveBlockedDates, effectiveTermStart, effectiveTermEnd,
    getSlotDate, formatSlotDate,
    updatePhases, saveAllPhases, bookCourse, cancelBooking,
    addCourse, removeCourse, updateCourse, refreshCourses,
    addUser, updateUser, deleteUser, refreshUsers,
    rescheduleBooking,
    addAuditLog, refreshAuditLogs,
    refreshBookings, backendOnline, loading,
    anchorSlots, addAnchorSlot, removeAnchorSlot, refreshAnchors, isAnchored,
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
    academicTerms: [], setAcademicTerms: () => {}, addAcademicTerm: async () => ({ success: false }), refreshTerms: async () => null,
    activeTermCalendar: null, activateTermCalendar: () => {},
    effectiveWeekStartDates: defaultWeekStartDates, effectiveBlockedDates: defaultBlockedDates,
    effectiveTermStart: '2026-01-11', effectiveTermEnd: '2026-05-21',
    getSlotDate: staticGetSlotDate, formatSlotDate: staticFormatSlotDate,
    updatePhases: () => {}, saveAllPhases: async () => ({ success: false }),
    bookCourse: async () => ({ success: false }), cancelBooking: async () => ({ success: false }), addAuditLog: () => {},
    addCourse: async () => ({ success: false }), removeCourse: async () => ({ success: false }),
    updateCourse: async () => ({ success: false }), refreshCourses: async () => null,
    addUser: async () => ({ success: false }), updateUser: async () => ({ success: false }),
    deleteUser: async () => ({ success: false }), refreshUsers: async () => null,
    rescheduleBooking: async () => ({ success: false }),
    refreshBookings: async () => null, refreshAuditLogs: async () => null, backendOnline: false, loading: false,
    anchorSlots: [], addAnchorSlot: async () => ({ success: false }), removeAnchorSlot: async () => ({ success: false }), refreshAnchors: async () => null, isAnchored: () => false,
  };
  return ctx;
};
