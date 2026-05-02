import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import ExamCalendar from '../components/ExamCalendar.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { getRequiredExamTypes, EXAM_TYPES } from '../lib/mock-data.js';
import { checkBookingConflict } from '../services/api.js';

import { ArrowLeft, Check, X, AlertTriangle, Users, CheckCircle2, Lock } from 'lucide-react';
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
  const { courses, examSlots, bookCourse, rescheduleBooking, cancelBooking, getSlotDate, isAnchored, addAnchorSlot, formatSlotDate } = useCourses();
  const { user } = useAuth();

  // Support query params for admin/committee flow
  const searchParams = new URLSearchParams(window.location.search);
  const fromAdmin = searchParams.get('from') === 'admin';
  const fromCommittee = searchParams.get('from') === 'committee';
  const requestedExamType = searchParams.get('examType');

  const course = courses.find((c) => c.id === courseId);
  const hasAnyBooking = !!(course && Object.keys(course.bookings || {}).length);

  const isMajorType = (t) => t === 'Major 1' || t === 'Major 2';
  const modeOf = (t) => (t === 'Mid' ? 'mid' : isMajorType(t) ? 'major' : null);
  const existingTypes = course ? Object.keys(course.bookings || {}) : [];
  const hasMidBooked = existingTypes.some((t) => modeOf(t) === 'mid');
  const hasAnyMajorBooked = existingTypes.some((t) => modeOf(t) === 'major');

  // Show all exam types whenever:
  //  - committee anchor flow,
  //  - rescheduling (course already has a booking — coordinator may switch type),
  //  - admin override.
  // Otherwise restrict to whatever pairing rules dictate (Major1+Major2 vs Mid).
  const availableTypes = (fromCommittee || hasAnyBooking || fromAdmin)
    ? EXAM_TYPES
    : (course ? getRequiredExamTypes(course) : []);

  // Prefer a stable "current booking type" for display only. Logic below uses mode checks instead.
  const currentBookingType = existingTypes[0];
  const defaultExamType = (requestedExamType && availableTypes.includes(requestedExamType))
    ? requestedExamType
    : currentBookingType || availableTypes.find(t => !course?.bookings[t]) || availableTypes[0] || '';

  const [examType, setExamType] = useState(defaultExamType);
  // Track initial type mainly for conflict-check exclusion id.
  const [originalExamType] = useState(requestedExamType || currentBookingType || defaultExamType);

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
  const [maleProctors, setMaleProctors] = useState(existingBooking?.maleProctors?.toString() || '');
  const [femaleProctors, setFemaleProctors] = useState(existingBooking?.femaleProctors?.toString() || '');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTypeSwitchConfirm, setShowTypeSwitchConfirm] = useState(false);
  const [pendingExamType, setPendingExamType] = useState(null);
  const [conflictMessage, setConflictMessage] = useState(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  if (!course) {
    return (
      <DashboardLayout>
        <div className="text-center" style={{ padding: '80px 0' }}>
          <p className="text-muted">Course not found.</p>
          <button className="btn btn-outline mt-4" onClick={() => navigate(fromCommittee ? '/committee' : fromAdmin ? '/admin' : '/dashboard')}>
            Back to {fromCommittee ? 'Committee' : fromAdmin ? 'Admin' : 'Dashboard'}
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
    setConflictMessage(null);
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

  const handleSelectDate = async (dateStr, weekDay) => {
    if (!weekDay) return;
    setSelectedDate(dateStr);
    setSelectedWeekDay(weekDay);
    setConflictMessage(null);

    // Live conflict check against backend (FR-CC3) — runs the moment a slot is picked.
    if (!course?.code || !dateStr) return;
    const originalBooking = course.bookings[originalExamType];
    const excludeBookingId = originalBooking?._serverId || undefined;
    setCheckingConflict(true);
    try {
      const result = await checkBookingConflict({
        courseCode: course.code,
        examDate: dateStr,
        excludeBookingId,
      });
      if (result?.hasConflict) {
        setConflictMessage(
          'Booking Blocked — Student conflict detected. This date already has an exam for shared students.'
        );
      }
    } catch {
      // Backend unreachable — silently skip; final POST/PUT will catch any conflict.
    } finally {
      setCheckingConflict(false);
    }
  };

  const handleSubmit = () => {
    if (!selectedWeekDay || !examType) return;
    // Block if this exam type is anchored by committee (only for non-committee users)
    if (!fromCommittee && isAnchored(course.code, examType)) {
      toast.error(`${examType} for ${course.code} is committee-fixed and cannot be self-booked.`);
      return;
    }
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

    if (fromCommittee) {
      // Committee flow: save as anchor slot AND create/update the booking.
      const dateLabel = formatSlotDate(selectedWeekDay.week, selectedWeekDay.day);
      await addAnchorSlot({
        courseCode: course.code,
        courseName: course.name,
        examType,
        week: selectedWeekDay.week,
        date: dateLabel,
        createdBy: user?.name || 'Committee',
      });

      // If a booking already exists for this course+examType, reschedule it (PUT).
      // Otherwise create a new one (POST). This prevents duplicate key errors.
      const existingForType = course.bookings[examType];
      const result = existingForType
        ? await rescheduleBooking({
            courseId: course.id,
            oldExamType: examType,
            newExamType: examType,
            week: selectedWeekDay.week,
            day: selectedWeekDay.day,
            maleProctors: parseInt(maleProctors),
            femaleProctors: parseInt(femaleProctors),
            userName: user?.name || 'Committee',
            role: 'committee',
          })
        : await bookCourse({
            courseId: course.id,
            examType,
            week: selectedWeekDay.week,
            day: selectedWeekDay.day,
            maleProctors: parseInt(maleProctors),
            femaleProctors: parseInt(femaleProctors),
            userName: user?.name || 'Committee',
            forceSwitch: false,
          });

      if (!result?.success) return;
      toast.success(
        `${examType} exam anchored for ${course.code} on ${selectedDateFormatted}`,
        { description: 'Committee-fixed slot saved.' }
      );
      setTimeout(() => navigate('/committee'), 1500);
    } else {
      const selectedMode = modeOf(examType);
      const switchingModes = (selectedMode === 'mid' && hasAnyMajorBooked) || (selectedMode === 'major' && hasMidBooked);

      // If switching modes, cancel existing bookings in the other mode first.
      // This keeps Major 1 + Major 2 independent, while enforcing Mid ↔ Major exclusivity.
      if (switchingModes) {
        const toCancel = existingTypes.filter((t) => modeOf(t) !== selectedMode);
        for (const t of toCancel) {
          // Best-effort; if backend is offline we still update local state.
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
            maleProctors: parseInt(maleProctors),
            femaleProctors: parseInt(femaleProctors),
            userName: user?.name || 'Unknown',
          });
      if (!result?.success) return; // 409/400/500 — stay on page, toast shown
      toast.success(
        `${examType} exam ${existingForType ? 'rescheduled' : 'booked'} for ${course.code} on ${selectedDateFormatted}`,
        { description: 'Confirmation email sent to your KFUPM email.' }
      );
      const backPath = fromAdmin ? '/admin' : '/dashboard';
      setTimeout(() => navigate(backPath), 1500);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigate(fromCommittee ? '/committee' : fromAdmin ? '/admin' : '/dashboard')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isReschedule ? 'Reschedule' : 'Book'} Exam — {course.code}
            </h1>
            <p className="text-sm text-muted">
              {course.name} · Level {course.level} · {course.department}
            </p>
          </div>
        </div>

        {conflictMessage && (
          <div className="alert-danger">
            <AlertTriangle size={20} color="var(--clr-danger)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p className="alert-danger-title">Booking Blocked</p>
              <p className="alert-danger-text">{conflictMessage}</p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={() => setConflictMessage(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        <div className="booking-layout">
          <div>
            <ExamCalendar
              examSlots={examSlots}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              courseCode={course.code}
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
                  {availableTypes.map((type) => {
                    const anchored = isAnchored(course.code, type);
                    const disabled = anchored && !fromCommittee;
                    return (
                      <button
                        key={type}
                        className={`btn btn-sm ${examType === type ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => handleExamTypeChange(type)}
                        type="button"
                        disabled={disabled}
                        title={disabled ? 'Committee-fixed anchor slot' : ''}
                      >
                        {disabled && <Lock size={12} style={{ marginRight: 4 }} />}
                        {type}
                      </button>
                    );
                  })}
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

            {/* Proctor Requirements */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><Users size={16} /> Proctor Requirements</div>
              </div>
              <div className="card-content">
                <div className="form-group">
                  <label className="form-label" htmlFor="male">Male Proctors Required</label>
                  <input
                    id="male"
                    className="form-input"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={maleProctors}
                    onChange={(e) => setMaleProctors(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="female">Female Proctors Required</label>
                  <input
                    id="female"
                    className="form-input"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={femaleProctors}
                    onChange={(e) => setFemaleProctors(e.target.value)}
                  />
                </div>
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
                  <div className="summary-row">
                    <span className="summary-label">Male Proctors</span>
                    <span className="summary-value">{maleProctors || '—'}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Female Proctors</span>
                    <span className="summary-value">{femaleProctors || '—'}</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-block mt-4"
                  disabled={!selectedWeekDay || !examType || !maleProctors || !femaleProctors || !!conflictMessage || checkingConflict}
                  onClick={handleSubmit}
                  title={conflictMessage ? 'Resolve the student conflict by selecting a different date.' : ''}
                >
                  {checkingConflict ? 'Checking conflicts…' : 'Confirm Booking'}
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
              <p><span className="text-muted">Current:</span>{' '}<strong>{currentBookingType || '—'}</strong></p>
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
