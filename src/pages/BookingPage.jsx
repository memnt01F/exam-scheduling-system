import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import AdminScheduleCalendar from '../components/admin/AdminScheduleCalendar.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { getRequiredExamTypes, EXAM_TYPES } from '../lib/mock-data.js';
import { createBooking, updateBooking, getBookings } from '../services/api.js';

import { ArrowLeft, Check, X, Users, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'sonner';

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const BookingPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { courses, examSlots, bookCourse, rescheduleBooking, cancelBooking, getSlotDate, formatSlotDate, academicTerms } = useCourses();
  const { user } = useAuth();

  // Support query params for admin/deptHead flow
  const searchParams = new URLSearchParams(window.location.search);
  const from = searchParams.get('from');
  const fromAdmin = from === 'admin';
  const isPhase2 = searchParams.get('phase') === '2';
  const termIdParam = searchParams.get('termId');
  const bookingIdParam = searchParams.get('bookingId');
  const requestedExamType = searchParams.get('examType');
  const backPath = from === 'admin' ? '/admin' : from === 'deptHead' ? '/dept-head' : '/dashboard';

  const targetTermCalendar = termIdParam
    ? (academicTerms.find(t => (t._serverId || t.id) === termIdParam)?.calendarData || null)
    : null;

  const course = courses.find((c) => c.id === courseId);
  const hasAnyBooking = !!(course && Object.keys(course.bookings || {}).length);

  const isMajorType = (t) => t === 'Major 1' || t === 'Major 2';
  const modeOf = (t) => (t === 'Mid' ? 'mid' : isMajorType(t) ? 'major' : null);
  const existingTypes = course ? Object.keys(course.bookings || {}) : [];
  const hasMidBooked = existingTypes.some((t) => modeOf(t) === 'mid');
  const hasAnyMajorBooked = existingTypes.some((t) => modeOf(t) === 'major');

  // Show all exam types when rescheduling or admin override.
  // Otherwise restrict to whatever pairing rules dictate (Major1+Major2 vs Mid).
  const availableTypes = (hasAnyBooking || fromAdmin)
    ? EXAM_TYPES
    : (course ? getRequiredExamTypes(course) : []);

  // Prefer a stable "current booking type" for display only. Logic below uses mode checks instead.
  const currentBookingType = existingTypes[0];
  const defaultExamType = (requestedExamType && availableTypes.includes(requestedExamType))
    ? requestedExamType
    : currentBookingType || availableTypes.find(t => !course?.bookings[t]) || availableTypes[0] || '';

  const [examType, setExamType] = useState(defaultExamType);

  const existingBooking = course?.bookings[examType];

  const initialDate = existingBooking?.week && existingBooking?.day
    ? (() => {
        const d = getSlotDate(existingBooking.week, existingBooking.day);
        return d ? toDateStr(d) : null;
      })()
    : null;

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedWeekDay, setSelectedWeekDay] = useState(
    existingBooking?.week && existingBooking?.day
      ? { week: existingBooking.week, day: existingBooking.day }
      : null
  );
  const [maleProctors, setMaleProctors] = useState(existingBooking?.maleProctors?.toString() ?? '0');
  const [femaleProctors, setFemaleProctors] = useState(existingBooking?.femaleProctors?.toString() ?? '0');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTypeSwitchConfirm, setShowTypeSwitchConfirm] = useState(false);
  const [pendingExamType, setPendingExamType] = useState(null);
  const [topDays, setTopDays] = useState([]);
  const [confirmedExams, setConfirmedExams] = useState([]);

  useEffect(() => {
    if (!termIdParam) return;
    getBookings({ termId: termIdParam })
      .then(data => setConfirmedExams(
        Array.isArray(data) ? data.filter(e => (e.status === 'confirmed' || e.status === 'approved') && e.phaseNumber !== 2) : []
      ))
      .catch(() => setConfirmedExams([]));
  }, [termIdParam]);

  if (!course) {
    return (
      <DashboardLayout>
        <div className="text-center" style={{ padding: '80px 0' }}>
          <p className="text-muted">Course not found.</p>
          <button className="btn btn-outline mt-4" onClick={() => navigate(fromAdmin ? '/admin' : '/dashboard')}>
            Back to {fromAdmin ? 'Admin' : 'Dashboard'}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // If the course already has a booking, this page is effectively a reschedule/replace flow
  // even when switching the exam type (backend keeps one booking per course).
  const isReschedule = hasAnyBooking;

  const applyExamType = (type) => {
    setExamType(type);
    const booking = course.bookings[type];
    if (booking) {
      const d = getSlotDate(booking.week, booking.day);
      setSelectedDate(d ? toDateStr(d) : null);
      setSelectedWeekDay({ week: booking.week, day: booking.day });
      setMaleProctors(booking.maleProctors?.toString() || '');
      setFemaleProctors(booking.femaleProctors?.toString() || '');
    } else {
      setSelectedDate(null);
      setSelectedWeekDay(null);
      setMaleProctors('');
      setFemaleProctors('');
    }
  };

  const handleExamTypeChange = (type) => {
    if (!type || type === examType) return;

    // Only confirm when switching between Mid-mode and Major-mode.
    // Do NOT confirm when moving between Major 1 and Major 2.
    const nextMode = modeOf(type);
    const switchingModes = (nextMode === 'mid' && hasAnyMajorBooked) || (nextMode === 'major' && hasMidBooked);
    if (hasAnyBooking && switchingModes) {
      setPendingExamType(type);
      setShowTypeSwitchConfirm(true);
      return;
    }

    applyExamType(type);
  };

  const handleSelectDate = (dateStr, weekDay) => {
    if (!dateStr) return;
    setSelectedDate(dateStr);
    setSelectedWeekDay(weekDay || null);
  };

  const handleSubmit = () => {
    if (!selectedDate || !examType) return;
    if (!maleProctors || !femaleProctors) {
      toast.error('Please provide both male and female proctor counts.');
      return;
    }
    if (parseInt(maleProctors) < 0 || parseInt(femaleProctors) < 0) {
      toast.error('Proctor counts must be valid positive integers.');
      return;
    }
    setShowConfirm(true);
  };

  const selectedDateFormatted = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;

  const handleConfirmBooking = async () => {
    setShowConfirm(false);

    // Phase 2 (level 3/4 manual bookings) — use API directly
    if (isPhase2) {
      try {
        const payload = {
          courseCode: course.code,
          examType,
          examDate: selectedDate,
          maleProctors: parseInt(maleProctors),
          femaleProctors: parseInt(femaleProctors),
          level: course.level,
          termId: termIdParam || null,
          phaseNumber: 2,
          status: 'confirmed',
          createdBy: user?.name || 'Unknown',
          updatedBy: user?.name || 'Unknown',
        };
        if (bookingIdParam) {
          await updateBooking(bookingIdParam, payload);
        } else {
          await createBooking(payload);
        }
        toast.success(
          `${examType} exam ${bookingIdParam ? 'rescheduled' : 'booked'} for ${course.code} on ${selectedDateFormatted}`,
          { description: 'Confirmation email sent to your KFUPM email.' }
        );
        setTimeout(() => navigate(backPath), 1500);
      } catch (err) {
        toast.error(err?.data?.message || err?.message || 'Failed to save booking');
      }
      return;
    }

    // Phase 0/1 — original context-based flow
    const selectedMode = modeOf(examType);
    const switchingModes = (selectedMode === 'mid' && hasAnyMajorBooked) || (selectedMode === 'major' && hasMidBooked);

    if (switchingModes) {
      const toCancel = existingTypes.filter((t) => modeOf(t) !== selectedMode);
      for (const t of toCancel) {
        await cancelBooking(course.id, t, user?.name || 'Unknown', fromAdmin ? 'admin' : 'coordinator');
      }
    }

    const existingForType = course.bookings[examType];
    const result = existingForType
      ? await rescheduleBooking({
          courseId: course.id,
          oldExamType: examType,
          newExamType: examType,
          week: selectedWeekDay.week,
          day: selectedWeekDay.day,
          examDate: selectedDate,
          maleProctors: parseInt(maleProctors),
          femaleProctors: parseInt(femaleProctors),
          userName: user?.name || 'Unknown',
          role: fromAdmin ? 'admin' : 'coordinator',
        })
      : await bookCourse({
          courseId: course.id,
          examType,
          week: selectedWeekDay.week,
          day: selectedWeekDay.day,
          examDate: selectedDate,
          termId: termIdParam || undefined,
          maleProctors: parseInt(maleProctors),
          femaleProctors: parseInt(femaleProctors),
          userName: user?.name || 'Unknown',
        });
    if (!result?.success) return;
    toast.success(
      `${examType} exam ${existingForType ? 'rescheduled' : 'booked'} for ${course.code} on ${selectedDateFormatted}`,
      { description: 'Confirmation email sent to your KFUPM email.' }
    );
    setTimeout(() => navigate(backPath), 1500);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate(fromAdmin ? '/admin' : '/dashboard')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(isReschedule || bookingIdParam) ? 'Reschedule' : 'Book'} Exam — {course.code}
            </h1>
            <p className="text-sm text-muted">
              {course.name} · Level {course.level} · {course.department}
            </p>
          </div>
        </div>

        <div className="booking-layout">
          <div style={{ flex: 1, minWidth: 0 }}>
            <AdminScheduleCalendar
              exams={confirmedExams}
              termId={termIdParam}
              phaseNumber={2}
              term={termIdParam ? academicTerms.find(t => (t._serverId || t.id) === termIdParam) : null}
              bookingMode
              bookingCourse={course}
              bookingExamType={examType}
              bookingCurrentDate={initialDate}
              onDaySelected={handleSelectDate}
              onScoresReady={setTopDays}
              selectedDateOverride={selectedDate}
              hideTopDaysPanel
            />
          </div>

          <div className="space-y-4">
            {/* Exam Type Selector */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Exam Type</div>
              </div>
              <div className="card-content">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {availableTypes.map((type) => (
                    <button
                      key={type}
                      className={`btn btn-sm ${examType === type ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => handleExamTypeChange(type)}
                      type="button"
                    >
                      {type}
                    </button>
                  ))}
                </div>
                {examType && course.bookings[examType] && (
                  <p className="text-xs text-muted mt-2">
                    Already booked — selecting a new date will reschedule.
                  </p>
                )}
                {/* Hint about Major pairing */}
                {!Object.keys(course.bookings).length && (
                  <p className="text-xs text-muted mt-2">
                    Selecting Major 1 or Major 2 requires booking both. Selecting Mid books a single exam.
                  </p>
                )}
              </div>
            </div>

            {/* Top Recommended Days */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--clr-border)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--clr-muted)' }}>
                  Top Recommended Days
                </p>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topDays.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--clr-muted)' }}>Scores will appear once you open the calendar.</p>
                ) : topDays.map((d, idx) => {
                  const day = new Date(d.dateStr + 'T00:00:00');
                  const hue = Math.round(50 + d.score * 70);
                  const l   = Math.round(62 - d.score * 26);
                  const color = `hsl(${hue},72%,${l}%)`;
                  const label = d.score >= 0.7 ? 'Best' : d.score >= 0.4 ? 'Good' : 'Acceptable';
                  const isActive = selectedDate === d.dateStr;
                  return (
                    <div key={d.dateStr} onClick={() => handleSelectDate(d.dateStr)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: isActive ? '2px solid var(--clr-primary)' : '1px solid var(--clr-border)', background: isActive ? 'color-mix(in srgb, var(--clr-primary) 8%, var(--clr-card))' : 'var(--clr-card)', transition: 'background 0.1s', cursor: 'pointer' }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span>{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          <span style={{ color: 'var(--clr-muted)', fontWeight: 400, fontSize: 11 }}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                          <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 4, background: `hsla(${hue},72%,${l}%,0.15)`, color }}>{label}</span>
                        </div>
                        {d.courses?.length > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.courses.join(', ')}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>{d.score.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Booking Summary */}
            <div className="card">
              <div className="card-content" style={{ paddingTop: 20 }}>
                <h3 className="text-sm font-semibold mb-2">Booking Summary</h3>
                <div className="space-y-2">
                  <div className="summary-row">
                    <span className="summary-label">Course</span>
                    <span className="summary-value">{course.code}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Exam Type</span>
                    <span className="badge badge-outline">{examType || '—'}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Date</span>
                    <span className="summary-value">{selectedDateFormatted || '—'}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Week / Day</span>
                    <span className="summary-value">
                      {selectedWeekDay ? `Week ${selectedWeekDay.week}, Day ${selectedWeekDay.day}` : '—'}
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-block mt-4"
                  disabled={!selectedDate || !examType}
                  onClick={handleSubmit}
                >
                  Confirm Booking
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Confirm {examType} Booking</h2>
            <p className="modal-desc">
              This will reserve the {examType} exam slot immediately. A confirmation email will be sent to your KFUPM email.
            </p>
            <div style={{ background: 'var(--clr-muted-bg)', borderRadius: 'var(--radius)', padding: 16 }} className="space-y-2 text-sm">
              <p><span className="text-muted">Course:</span>{' '}<strong>{course.code} — {course.name}</strong></p>
              <p><span className="text-muted">Exam Type:</span>{' '}<strong>{examType}</strong></p>
              <p><span className="text-muted">Date:</span>{' '}<strong>{selectedDateFormatted}</strong></p>
              <p><span className="text-muted">Slot:</span>{' '}<strong>Week {selectedWeekDay?.week}, Day {selectedWeekDay?.day}</strong></p>
              <p><span className="text-muted">Proctors:</span>{' '}<strong>{maleProctors} male, {femaleProctors} female</strong></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConfirmBooking}>
                <Check size={16} /> Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showTypeSwitchConfirm && (
        <div className="modal-overlay" onClick={() => { setShowTypeSwitchConfirm(false); setPendingExamType(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Change Exam Type?</h2>
            <p className="modal-desc">
              Changing the exam type will remove the previously scheduled exam. Continue?
            </p>
            <div style={{ background: 'var(--clr-muted-bg)', borderRadius: 'var(--radius)', padding: 16 }} className="space-y-2 text-sm">
              <p><span className="text-muted">Course:</span>{' '}<strong>{course.code} — {course.name}</strong></p>
              <p><span className="text-muted">Current:</span>{' '}<strong>{existingTypes.join(' & ') || '—'}</strong></p>
              <p><span className="text-muted">New:</span>{' '}<strong>{pendingExamType || '—'}</strong></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => { setShowTypeSwitchConfirm(false); setPendingExamType(null); }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const next = pendingExamType;
                  setShowTypeSwitchConfirm(false);
                  setPendingExamType(null);
                  if (next) {
                    applyExamType(next);
                    toast.info('Exam type changed. Confirm booking to replace the previous schedule.');
                  }
                }}
              >
                <CheckCircle2 size={16} /> Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default BookingPage;
