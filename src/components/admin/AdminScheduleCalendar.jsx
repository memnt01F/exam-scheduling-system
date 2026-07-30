import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { updateScheduledExam, deleteScheduledExam, confirmSchedule, getBookings, getDayScores } from '../../services/api.js';
import { toast } from 'sonner';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MAX_CHIPS = 3;

const fmtCode = (code) => String(code).replace(/\(FINALPROGRAMMING\)/gi, '(lab)');

const EXAM_TYPE_COLOR = {
  'Major 1': '#14532d',
  'Major 2': '#166534',
  'Major 3': '#1a7a4c',
  'Mid':     '#16a34a',
};
const examColor = (examType) => EXAM_TYPE_COLOR[examType] || '#1a7a4c';

const toDateStr = (date) => {
  const d = new Date(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

const localDate = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const getWeekStart = (date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};

// Maps a score to visual style. Returns null when score is undefined (day outside window).
const scoreStyle = (score) => {
  if (score === undefined) return null;
  if (score < 0) return { bg: 'rgba(209,0,31,0.12)', outline: '2px solid rgba(209,0,31,0.22)', dot: '#d1001f', clickable: false };
  // Continuous: hue 50° (amber) → 120° (green); red is reserved for conflicts
  const hue  = Math.round(50 + score * 70);
  const l    = Math.round(62 - score * 26);
  const dot     = `hsl(${hue},72%,${l}%)`;
  const bg      = `hsla(${hue},72%,${l + 20}%,0.18)`;
  const outline = `2px solid hsla(${hue},72%,${l}%,0.28)`;
  return { bg, outline, dot, clickable: true };
};

const scoreDotColor = (score) => {
  const hue = Math.round(50 + score * 70);
  const l   = Math.round(62 - score * 26);
  return `hsl(${hue},72%,${l}%)`;
};

const scoreQualityLabel = (s) => s >= 0.7 ? 'Best' : s >= 0.4 ? 'Good' : 'Acceptable';

const TopDaysPanel = ({ dayScores, examsOnDate, bookingsOnDate, onClose, onDayClick, selectedDateStr }) => {
  const top = useMemo(() => {
    if (!dayScores) return [];
    return Object.entries(dayScores)
      .filter(([, s]) => s >= 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [dayScores]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--clr-muted)' }}>
          Top Recommended Days
        </p>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 2, lineHeight: 1 }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--clr-muted)' }}>No recommended days found</p>
          </div>
        ) : top.map(([dateStr, score], idx) => {
          const day = new Date(dateStr + 'T00:00:00');
          const courses = [
            ...(examsOnDate ? examsOnDate(day) : []).map(e => e.courseCode),
            ...(bookingsOnDate ? bookingsOnDate(day) : []).map(b => b.courseCode),
          ].filter(Boolean);
          const color = scoreDotColor(score);
          const isActive = selectedDateStr === dateStr;
          return (
            <div
              key={dateStr}
              onClick={() => onDayClick?.(dateStr)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                border: isActive ? '2px solid var(--clr-primary)' : '1px solid var(--clr-border)',
                background: isActive ? 'color-mix(in srgb, var(--clr-primary) 8%, var(--clr-card))' : 'var(--clr-card)',
                cursor: onDayClick ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
            >
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span>{day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span style={{ color: 'var(--clr-muted)', fontWeight: 400, fontSize: 11 }}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 4, background: `hsla(${Math.round(50 + score * 70)},72%,${Math.round(62 - score * 26)}%,0.15)`, color }}>
                    {scoreQualityLabel(score)}
                  </span>
                </div>
                {courses.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--clr-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {courses.join(', ')}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>
                {score.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AdminScheduleCalendar = ({
  exams: initialExams,
  termId,
  phaseNumber,
  term,
  onBack,
  readOnly = false,
  // Booking mode — used by coordinators / dept heads / admin for Phase 2
  bookingMode = false,
  bookingCourse = null,      // { id, code, name, level }
  bookingExamType = null,    // 'Major 1' | 'Major 2' | 'Mid' — controlled by parent
  bookingCurrentDate = null, // existing booking date string (for NOW indicator on reschedule)
  onDaySelected = null,      // (dateStr) => void — called when a day is clicked in booking mode
  onScoresReady = null,      // ([{ dateStr, score, courses }]) => void — parent receives top days
  selectedDateOverride = null, // dateStr — lets parent push a visual selection into booking mode
}) => {
  const [exams, setExams]           = useState(initialExams || []);
  const [viewMode, setViewMode]     = useState('month');
  const [saving, setSaving]         = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  // Scoring state
  const [selectedExam, setSelectedExam]           = useState(null);
  const [dayScores, setDayScores]                 = useState(null);   // { dateStr: score } | null
  const [loadingScores, setLoadingScores]         = useState(false);
  const [showTopDays, setShowTopDays]             = useState(true);
  const [rescheduleMode, setRescheduleMode]       = useState(false);
  const [rescheduleConfirm, setRescheduleConfirm] = useState(null);   // { date, dateStr }
  const [confirmDelete, setConfirmDelete]         = useState(null);   // exam object

  // Term bounds
  const termStartLocal = term?.startDate ? localDate(term.startDate) : null;
  const termEndLocal   = term?.endDate   ? localDate(term.endDate)   : null;
  const termStartMonth = termStartLocal ? new Date(termStartLocal.getFullYear(), termStartLocal.getMonth(), 1) : null;
  const termEndMonth   = termEndLocal   ? new Date(termEndLocal.getFullYear(),   termEndLocal.getMonth(),   1) : null;

  const [currentDate, setCurrentDate] = useState(() => {
    if (term?.startDate) return localDate(term.startDate);
    const first = (initialExams || []).find(e => e.examDate);
    return first ? new Date(first.examDate) : new Date();
  });

  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    getBookings()
      .then(data => {
        const all = Array.isArray(data) ? data : [];
        const filtered = all.filter(b => {
          if (!b.examDate || b.status === 'cancelled') return false;
          const d = new Date(b.examDate);
          if (termStartLocal && d < termStartLocal) return false;
          if (termEndLocal   && d > termEndLocal)   return false;
          return true;
        });
        setBookings(filtered);
      })
      .catch(() => {});
  }, []);

  const isConfirmed  = readOnly || (exams.length > 0 && exams.every(e => e.confirmedAt));
  const todayStr     = toDateStr(new Date());
  const blockedDates     = useMemo(() => term?.calendarData?.blockedDates     || {}, [term]);
  const softBlockedDates = useMemo(() => term?.calendarData?.softBlockedDates || {}, [term]);

  const getAcademicWeek = (date) => {
    if (!termStartLocal || !date) return null;
    const cellMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.round((cellMidnight - termStartLocal) / 86400000);
    if (daysDiff < 0) return null;
    if (termEndLocal && cellMidnight > termEndLocal) return null;
    return Math.floor(daysDiff / 7) + 1;
  };

  const examsOnDate    = (date) => { if (!date) return []; const ds = toDateStr(date); return exams.filter(e => toDateStr(e.examDate) === ds); };
  const bookingsOnDate = (date) => { if (!date) return []; const ds = toDateStr(date); return bookings.filter(b => toDateStr(b.examDate) === ds); };

  // Returns true if a day can be clicked to book in bookingMode
  const isBookableDay = (day) => {
    if (!day) return false;
    const dateStr = toDateStr(day);
    if (blockedDates[dateStr]) return false;
    if (softBlockedDates[dateStr]) return true; // Phase 2 can book B54 days
    const score = dayScores?.[dateStr];
    const hasScoreData = dayScores && Object.keys(dayScores).length > 0;
    if (hasScoreData) return score !== undefined && score >= 0;
    // No scoring data — fall back to term bounds
    const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    if (termStartLocal && midnight < termStartLocal) return false;
    if (termEndLocal && midnight > termEndLocal) return false;
    return true;
  };

  // Month grid
  const monthGrid = useMemo(() => {
    const year = currentDate.getFullYear(), month = currentDate.getMonth();
    const days = [];
    const first = new Date(year, month, 1);
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    const last = new Date(year, month + 1, 0);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { weeks, month };
  }, [currentDate]);

  const weekDays = useMemo(() => {
    const start = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  }, [currentDate]);

  // Navigation
  const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const canGoPrev = viewMode === 'month' ? !termStartMonth || currentMonth > termStartMonth : true;
  const canGoNext = viewMode === 'month' ? !termEndMonth || currentMonth < termEndMonth : true;

  const prevPeriod = () => {
    if (!canGoPrev) return;
    setSelectedDay(null);
    if (viewMode === 'month') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  };
  const nextPeriod = () => {
    if (!canGoNext) return;
    setSelectedDay(null);
    if (viewMode === 'month') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  };

  const periodLabel = () => {
    if (viewMode === 'month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const ws = getWeekStart(currentDate);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const wk = getAcademicWeek(ws);
    const range = `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return wk ? `${range} · Week ${wk}` : range;
  };

  // Scoring handlers
  const clearSelection = () => {
    setSelectedExam(null);
    setDayScores(null);
    setRescheduleMode(false);
    setRescheduleConfirm(null);
  };

  // Auto-load scores in booking mode whenever course or exam type changes
  useEffect(() => {
    if (!bookingMode || !bookingCourse?.code || !bookingExamType || !term?.name) return;
    setShowTopDays(true);
    setLoadingScores(true);
    setDayScores(null);
    getDayScores({ courseCode: bookingCourse.code, examType: bookingExamType, termId })
      .then(result => {
        const map = {};
        (result.dates || []).forEach((d, i) => { map[d] = result.scores[i]; });
        setDayScores(map);
      })
      .catch(() => setDayScores(null)) // scoring unavailable — allow all non-blocked days
      .finally(() => setLoadingScores(false));
  }, [bookingMode, bookingCourse?.code, bookingExamType, term?.name]);

  // Push top recommended days to parent when scores or bookings update (booking mode only)
  useEffect(() => {
    if (!bookingMode || !dayScores || !onScoresReady) return;
    const top = Object.entries(dayScores)
      .filter(([, s]) => s >= 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([dateStr, score]) => ({
        dateStr, score,
        courses: bookings.filter(b => toDateStr(new Date(b.examDate)) === dateStr).map(b => b.courseCode),
      }));
    onScoresReady(top);
  }, [bookingMode, dayScores, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChipClick = async (e, exam) => {
    e.stopPropagation();
    if (bookingMode || isConfirmed) return; // chips are display-only in booking mode
    if (selectedExam?._id === exam._id) { clearSelection(); return; }

    setSelectedExam(exam);
    setRescheduleMode(false);
    setDayScores(null);
    setShowTopDays(true);
    setLoadingScores(true);

    try {
      const result = await getDayScores({ courseCode: exam.courseCode, examType: exam.examType, termId });
      const map = {};
      (result.dates || []).forEach((d, i) => { map[d] = result.scores[i]; });
      setDayScores(map);
    } catch (err) {
      toast.error(err?.message || 'Failed to load day scores');
      setDayScores({});
    } finally {
      setLoadingScores(false);
    }
  };

  const handleCellClick = (day) => {
    if (!day) return;

    if (bookingMode) {
      if (!isBookableDay(day)) return;
      const dateStr = toDateStr(day);
      setSelectedDay(prev => prev && toDateStr(prev) === dateStr ? null : day);
      onDaySelected?.(dateStr);
      return;
    }

    if (rescheduleMode && selectedExam && dayScores) {
      const dateStr = toDateStr(day);
      const score = dayScores[dateStr];
      if (score !== undefined && score >= 0) setRescheduleConfirm({ date: day, dateStr });
      return;
    }
    setSelectedDay(prev => prev && toDateStr(prev) === toDateStr(day) ? null : day);
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleConfirm || !selectedExam) return;
    setSaving(true);
    try {
      const updated = await updateScheduledExam(selectedExam._id, { examDate: rescheduleConfirm.dateStr, updatedBy: 'admin' });
      setExams(prev => prev.map(e => e._id === selectedExam._id ? { ...e, ...updated } : e));
      toast.success('Exam rescheduled');
      clearSelection();
    } catch { toast.error('Failed to reschedule exam'); }
    finally { setSaving(false); setRescheduleConfirm(null); }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await deleteScheduledExam(confirmDelete._id);
      setExams(prev => prev.filter(e => e._id !== confirmDelete._id));
      toast.success('Exam removed from schedule');
      if (selectedExam?._id === confirmDelete._id) clearSelection();
    } catch { toast.error('Failed to remove exam'); }
    finally { setSaving(false); setConfirmDelete(null); }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await confirmSchedule({ termId, phaseNumber, confirmedBy: 'admin' });
      const now = new Date().toISOString();
      setExams(prev => prev.map(e => ({ ...e, confirmedAt: now })));
      toast.success('Schedule confirmed');
    } catch { toast.error('Failed to confirm schedule'); }
    finally { setConfirming(false); }
  };

  // Chips
  const ExamChip = ({ exam }) => {
    const isSelected = selectedExam?._id === exam._id;
    return (
      <div
        onClick={(e) => handleChipClick(e, exam)}
        title={`${fmtCode(exam.courseCode)} — ${exam.examType}${isConfirmed ? '' : '\nClick to see scoring'}`}
        style={{
          background: isSelected ? '#fff' : examColor(exam.examType),
          color: isSelected ? examColor(exam.examType) : '#fff',
          border: isSelected ? `2px solid ${examColor(exam.examType)}` : '2px solid transparent',
          borderRadius: 3, padding: '2px 7px', fontSize: 11, fontWeight: 600,
          cursor: isConfirmed ? 'default' : 'pointer',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2,
          transition: 'all 0.1s',
        }}
      >
        {fmtCode(exam.courseCode)}
      </div>
    );
  };

  const BookingChip = ({ booking }) => (
    <div
      title={`${booking.courseCode} — ${booking.examType} (Phase 2 booking)`}
      style={{
        background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text)',
        borderRadius: 3, padding: '2px 7px', fontSize: 11, fontWeight: 500,
        cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2,
      }}
    >
      {booking.courseCode}
    </div>
  );

  const ExamPanelRow = ({ exam }) => {
    const isSelected = selectedExam?._id === exam._id;
    return (
      <div
        onClick={(e) => handleChipClick(e, exam)}
        style={{
          background: isSelected ? '#fff' : examColor(exam.examType),
          color: isSelected ? examColor(exam.examType) : '#fff',
          border: isSelected ? `2px solid ${examColor(exam.examType)}` : '2px solid transparent',
          borderRadius: 6, padding: '8px 12px', marginBottom: 6,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: isConfirmed ? 'default' : 'pointer', fontSize: 12, fontWeight: 500,
          transition: 'all 0.1s',
        }}
      >
        <span style={{ fontWeight: 600 }}>{fmtCode(exam.courseCode)}</span>
        <span style={{ opacity: 0.85, fontSize: 11 }}>{exam.examType}</span>
      </div>
    );
  };

  const BookingPanelRow = ({ booking }) => (
    <div
      style={{
        background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text)',
        borderRadius: 6, padding: '8px 12px', marginBottom: 6,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'default', fontSize: 12, fontWeight: 500,
      }}
    >
      <span style={{ fontWeight: 600 }}>{booking.courseCode}</span>
      <span style={{ opacity: 0.6, fontSize: 11 }}>{booking.examType}</span>
    </div>
  );

  const selectedDayExams    = selectedDay ? examsOnDate(selectedDay) : [];
  const selectedDayBookings = selectedDay ? bookingsOnDate(selectedDay) : [];
  const currentExamDateStr  = bookingMode ? bookingCurrentDate : (selectedExam ? toDateStr(selectedExam.examDate) : null);

  const ScoreLegend = () => {
    const [tip, setTip] = useState(null);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 20px', borderBottom: '1px solid var(--clr-border)', fontSize: 11, color: 'var(--clr-muted)', flexWrap: 'wrap', position: 'relative' }}>
        <span style={{ fontWeight: 500 }}>Score:</span>
        {/* Conflict dot */}
        <span
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: 'Cannot be scheduled — a student in this course has another exam on this day.', x: r.left, y: r.bottom }); }}
          onMouseLeave={() => setTip(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1001f', flexShrink: 0, display: 'inline-block' }} />
          Conflict
        </span>
        {/* Blocked dot */}
        <span
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: 'Hard blocked — vacation or holiday. No exam can be scheduled here.', x: r.left, y: r.bottom }); }}
          onMouseLeave={() => setTip(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#374151', flexShrink: 0, display: 'inline-block' }} />
          Blocked
        </span>
        {/* B54 Unavailable dot */}
        <span
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: 'B54 Unavailable — Building 54 is not available. Phase 0 exams cannot be scheduled here; Phase 1 and 2 are unaffected.', x: r.left, y: r.bottom }); }}
          onMouseLeave={() => setTip(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#9ca3af', flexShrink: 0, display: 'inline-block' }} />
          B54 Unavailable
        </span>
        {/* Continuous gradient bar */}
        <span
          onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: 'Continuous score: left = poor (few options, many conflicts), right = best available days.', x: r.left, y: r.bottom }); }}
          onMouseLeave={() => setTip(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{
              width: 100, height: 8, borderRadius: 4,
              background: 'linear-gradient(to right, hsl(50,72%,62%), hsl(85,72%,49%), hsl(120,72%,36%))',
              display: 'block',
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 100, fontSize: 9, color: 'var(--clr-muted)' }}>
              <span>0.0</span><span>0.4</span><span>0.7</span><span>1.0</span>
            </div>
          </div>
        </span>
        {bookingMode && (
          <span style={{ marginLeft: 'auto', color: 'var(--clr-primary)', fontWeight: 600 }}>
            Click a scored day to book
          </span>
        )}
        {!bookingMode && rescheduleMode && (
          <span style={{ marginLeft: 'auto', color: 'var(--clr-primary)', fontWeight: 600 }}>
            Click a scored day to reschedule
          </span>
        )}
        {tip && (
          <div style={{
            position: 'fixed', zIndex: 300,
            left: tip.x, top: tip.y + 6,
            background: '#1f2937', color: '#f9fafb',
            fontSize: 11, lineHeight: 1.45,
            padding: '5px 9px', borderRadius: 5,
            pointerEvents: 'none', maxWidth: 240,
            boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
          }}>
            {tip.text}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button className="btn btn-outline btn-sm" onClick={onBack} style={{ padding: '4px 10px', flexShrink: 0 }}>
              <ArrowLeft size={14} />
            </button>
          )}
          <div>
            {bookingMode ? (
              <>
                <span className="font-medium" style={{ fontSize: 15 }}>
                  Booking: {bookingCourse?.code}
                </span>
                <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                  {bookingExamType} · {term?.name}
                  {loadingScores && ' · Loading scores…'}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium" style={{ fontSize: 15 }}>Exams Schedule</span>
                {term && <span className="text-xs text-muted" style={{ marginLeft: 8 }}>{term.name} · Phase {phaseNumber}</span>}
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2, border: '1px solid var(--clr-border)', borderRadius: 6, padding: 2 }}>
            {['Month', 'Week'].map(label => {
              const mode = label.toLowerCase();
              return (
                <button key={mode} onClick={() => { setViewMode(mode); setSelectedDay(null); }} className={`btn btn-sm ${viewMode === mode ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12, minWidth: 52 }}>
                  {label}
                </button>
              );
            })}
          </div>
          {!bookingMode && (readOnly ? (
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--clr-muted)', border: '1px solid var(--clr-border)', borderRadius: 6, padding: '4px 10px' }}>
              VIEW ONLY
            </span>
          ) : (
            <button className={`btn btn-sm ${isConfirmed ? 'btn-outline' : 'btn-primary'}`} onClick={handleConfirm} disabled={confirming || isConfirmed || exams.length === 0} style={{ gap: 6, whiteSpace: 'nowrap' }}>
              <CheckCircle size={14} />
              {confirming ? 'Confirming…' : isConfirmed ? 'Confirmed' : 'Confirm Schedule'}
            </button>
          ))}
        </div>
      </div>

      {/* Sticky score bar — visible when an exam is selected (non-booking mode only) */}
      {!bookingMode && selectedExam && !isConfirmed && (
        <div style={{ background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: examColor(selectedExam.examType), flexShrink: 0 }} />
            <span className="font-medium" style={{ fontSize: 13 }}>{selectedExam.courseCode}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>— {selectedExam.examType}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>· Currently {currentExamDateStr}</span>
            {loadingScores && <span className="text-xs text-muted" style={{ marginLeft: 4 }}>Loading scores…</span>}
          </div>
          {!rescheduleMode ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                className="btn btn-sm"
                style={{ color: '#dc2626', border: '1px solid #fecaca', background: 'color-mix(in srgb, #ef4444 6%, var(--clr-card))', fontWeight: 500 }}
                onClick={() => setConfirmDelete(selectedExam)}
                disabled={saving}
              >
                Remove
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={!dayScores || loadingScores || saving}
                onClick={() => setRescheduleMode(true)}
              >
                Reschedule
              </button>
            </div>
          ) : (
            <span className="text-xs" style={{ color: 'var(--clr-primary)', fontWeight: 600 }}>
              Click a green or amber day to reschedule
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={clearSelection} style={{ padding: 4 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Calendar card */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex' }}>

          {/* Left: top recommended days — shown when exam selected + scores loaded, or in booking mode */}
          {dayScores && !rescheduleMode && showTopDays && (bookingMode || selectedExam) && (
            <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--clr-border)', display: 'flex', flexDirection: 'column' }}>
              <TopDaysPanel
                dayScores={dayScores}
                examsOnDate={examsOnDate}
                bookingsOnDate={bookingsOnDate}
                onClose={() => setShowTopDays(false)}
                selectedDateStr={bookingMode ? selectedDateOverride : null}
                onDayClick={bookingMode ? (dateStr) => {
                  setSelectedDay(new Date(dateStr + 'T00:00:00'));
                  onDaySelected?.(dateStr);
                } : null}
              />
            </div>
          )}

          {/* Center: nav + grid */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Nav bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--clr-border)' }}>
              <button className="btn btn-outline btn-sm" onClick={prevPeriod} disabled={!canGoPrev} style={{ gap: 4 }}><ChevronLeft size={14} /> Prev</button>
              <span className="exam-cal-month">{periodLabel()}</span>
              <button className="btn btn-outline btn-sm" onClick={nextPeriod} disabled={!canGoNext} style={{ gap: 4 }}>Next <ChevronRight size={14} /></button>
            </div>

            {/* Score legend — when scores loaded, or in booking mode (always visible) */}
            {(dayScores || bookingMode) && <ScoreLegend />}

            {/* Month view */}
            {viewMode === 'month' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--clr-border)' }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ padding: '8px 0', fontSize: 11, fontWeight: 600, color: 'var(--clr-muted)', textAlign: 'center', letterSpacing: '0.04em' }}>{d}</div>
                  ))}
                </div>

                {monthGrid.weeks.map((week, wi) => (
                  <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi < monthGrid.weeks.length - 1 ? '1px solid var(--clr-border)' : 'none' }}>
                    {week.map((day, di) => {
                      const inMonth       = day && day.getMonth() === monthGrid.month;
                      const isToday       = day ? toDateStr(day) === todayStr : false;
                      const isSelected    = day && (
                        bookingMode && selectedDateOverride
                          ? toDateStr(day) === selectedDateOverride
                          : selectedDay && toDateStr(day) === toDateStr(selectedDay)
                      );
                      const blockReason   = day ? blockedDates[toDateStr(day)]     : null;
                      const softReason    = day ? softBlockedDates[toDateStr(day)] : null;
                      const dayExams      = examsOnDate(day);
                      const dayBookings   = bookingsOnDate(day);
                      const wk            = day ? getAcademicWeek(day) : null;
                      const dateStr       = day ? toDateStr(day) : null;
                      const isCurrentExam = dateStr === currentExamDateStr;

                      const score = dateStr && dayScores && inMonth ? dayScores[dateStr] : undefined;
                      const ss    = scoreStyle(score);

                      const visibleExams    = dayExams.slice(0, MAX_CHIPS);
                      const remaining       = MAX_CHIPS - visibleExams.length;
                      const visibleBookings = dayBookings.slice(0, remaining);
                      const overflow        = (dayExams.length + dayBookings.length) - (visibleExams.length + visibleBookings.length);

                      const bookable = bookingMode && day ? isBookableDay(day) : true;
                      // Out-of-window: not bookable AND no score (outside exam period).
                      // Conflicts (score < 0) are also !bookable but need the red background, not gray.
                      const outOfWindow = bookingMode && !bookable && score === undefined;

                      const cellBg = !inMonth
                        ? 'var(--clr-surface)'
                        : bookingMode && isSelected
                          ? 'color-mix(in srgb, var(--clr-primary) 18%, var(--clr-card))'
                          : blockReason
                            ? '#b8bfc9'
                            : softReason
                              ? '#dde0e4'
                              : outOfWindow
                                ? 'var(--clr-surface)'
                                : ss
                                  ? ss.bg
                                  : isSelected
                                    ? 'color-mix(in srgb, var(--clr-primary) 6%, var(--clr-card))'
                                    : 'var(--clr-card)';

                      const cellOutline = bookingMode && isSelected
                        ? '3px solid var(--clr-primary)'
                        : ss ? ss.outline : isSelected ? '2px solid var(--clr-primary)' : 'none';

                      return (
                        <div
                          key={di}
                          onClick={() => handleCellClick(day)}
                          style={{
                            minHeight: 90, padding: '6px 8px',
                            borderRight: di < 6 ? '1px solid var(--clr-border)' : 'none',
                            background: cellBg,
                            cursor: !day ? 'default' : (rescheduleMode && ss?.clickable) ? 'copy' : (bookingMode && !bookable) ? 'default' : 'pointer',
                            outline: cellOutline,
                            outlineOffset: -2,
                            transition: 'background 0.1s',
                          }}
                        >
                          {day && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{
                                  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  borderRadius: '50%', fontSize: 13, lineHeight: 1,
                                  fontWeight: isToday ? 700 : 400,
                                  background: isToday ? 'var(--clr-primary)' : 'transparent',
                                  color: isToday ? '#fff' : inMonth ? 'var(--clr-text)' : 'var(--clr-muted)',
                                }}>
                                  {day.getDate()}
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {bookingMode && isSelected
                                      ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--clr-primary)' }}>✓</span>
                                      : blockReason
                                        ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#374151', flexShrink: 0 }} />
                                        : softReason
                                          ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#9ca3af', flexShrink: 0 }} />
                                          : ss && score < 0 && <span style={{ width: 7, height: 7, borderRadius: '50%', background: ss.dot, flexShrink: 0 }} />
                                    }
                                    {isCurrentExam && <span style={{ fontSize: 9, fontWeight: 700, color: examColor(selectedExam?.examType), letterSpacing: '0.02em' }}>NOW</span>}
                                    {wk !== null && <span style={{ fontSize: 10, color: 'var(--clr-muted)', opacity: 0.55 }}>W{wk}</span>}
                                  </div>
                                  {ss && score >= 0 && !blockReason && !softReason && inMonth && (
                                    <span style={{ fontSize: 9, fontWeight: 700, color: `hsl(${Math.round(50 + score * 70)},72%,28%)`, background: `hsla(${Math.round(50 + score * 70)},65%,${Math.round(77 - score * 26)}%,0.55)`, borderRadius: 8, padding: '1px 5px', lineHeight: 1.4 }}>
                                      {score.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {blockReason && inMonth && (
                                <div style={{ fontSize: 10, color: '#374151', fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {blockReason.length > 18 ? blockReason.slice(0, 16) + '…' : blockReason}
                                </div>
                              )}
                              {softReason && inMonth && (
                                <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {softReason.length > 18 ? softReason.slice(0, 16) + '…' : softReason}
                                </div>
                              )}
                              {visibleExams.map(exam => <ExamChip key={exam._id} exam={exam} />)}
                              {visibleBookings.map(b => <BookingChip key={b._id} booking={b} />)}
                              {overflow > 0 && (
                                <div style={{ fontSize: 10, color: 'var(--clr-primary)', fontWeight: 600, padding: '1px 4px' }}>+{overflow} more</div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Week view */}
            {viewMode === 'week' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--clr-border)' }}>
                  {weekDays.map((day, i) => {
                    const isToday = toDateStr(day) === todayStr;
                    return (
                      <div key={i} style={{ padding: '10px 0', textAlign: 'center', borderRight: i < 6 ? '1px solid var(--clr-border)' : 'none' }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-muted)', letterSpacing: '0.04em', marginBottom: 4 }}>{DAYS[i]}</p>
                        <span style={{ display: 'inline-flex', width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: 14, fontWeight: isToday ? 700 : 400, background: isToday ? 'var(--clr-primary)' : 'transparent', color: isToday ? '#fff' : 'var(--clr-text)' }}>
                          {day.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {weekDays.map((day, i) => {
                    const isSelected    = bookingMode && selectedDateOverride
                      ? toDateStr(day) === selectedDateOverride
                      : selectedDay && toDateStr(day) === toDateStr(selectedDay);
                    const blockReason   = blockedDates[toDateStr(day)];
                    const softReason    = softBlockedDates[toDateStr(day)];
                    const dateStr       = toDateStr(day);
                    const isCurrentExam = dateStr === currentExamDateStr;
                    const score         = dayScores ? dayScores[dateStr] : undefined;
                    const ss            = scoreStyle(score);

                    const bookable = bookingMode ? isBookableDay(day) : true;
                    const outOfWindow = bookingMode && !bookable && score === undefined;

                    return (
                      <div
                        key={i}
                        onClick={() => handleCellClick(day)}
                        style={{
                          minHeight: 200, padding: '8px 6px',
                          borderRight: i < 6 ? '1px solid var(--clr-border)' : 'none',
                          cursor: (rescheduleMode && ss?.clickable) ? 'copy' : (bookingMode && !bookable) ? 'default' : 'pointer',
                          background: bookingMode && isSelected
                            ? 'color-mix(in srgb, var(--clr-primary) 18%, var(--clr-card))'
                            : blockReason
                              ? '#b8bfc9'
                              : softReason
                                ? '#dde0e4'
                                : outOfWindow
                                  ? 'var(--clr-surface)'
                                  : ss
                                    ? ss.bg
                                    : isSelected
                                      ? 'color-mix(in srgb, var(--clr-primary) 6%, var(--clr-card))'
                                      : 'var(--clr-card)',
                          outline: bookingMode && isSelected
                            ? '3px solid var(--clr-primary)'
                            : ss ? ss.outline : isSelected ? '2px solid var(--clr-primary)' : 'none',
                          outlineOffset: -2,
                          transition: 'background 0.1s',
                        }}
                      >
                        {bookingMode && isSelected
                          ? <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--clr-primary)', marginBottom: 4 }}>✓ Selected</span>
                          : blockReason
                            ? <span style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: '#374151', marginBottom: 4 }} />
                            : softReason
                              ? <span style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: '#9ca3af', marginBottom: 4 }} />
                              : ss && score >= 0
                                ? <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, color: `hsl(${Math.round(50 + score * 70)},72%,28%)`, background: `hsla(${Math.round(50 + score * 70)},65%,${Math.round(77 - score * 26)}%,0.55)`, borderRadius: 8, padding: '1px 5px', lineHeight: 1.4, marginBottom: 4 }}>{score.toFixed(2)}</span>
                                : ss && <span style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: ss.dot, marginBottom: 4 }} />
                        }
                        {isCurrentExam && <div style={{ fontSize: 9, fontWeight: 700, color: examColor(selectedExam?.examType), marginBottom: 2 }}>CURRENT</div>}
                        {blockReason && (
                          <div style={{ fontSize: 10, color: '#374151', fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {blockReason.length > 22 ? blockReason.slice(0, 20) + '…' : blockReason}
                          </div>
                        )}
                        {softReason && (
                          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {softReason.length > 22 ? softReason.slice(0, 20) + '…' : softReason}
                          </div>
                        )}
                        {examsOnDate(day).map(exam => <ExamChip key={exam._id} exam={exam} />)}
                        {bookingsOnDate(day).map(b => <BookingChip key={b._id} booking={b} />)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: day detail panel — hidden during reschedule mode */}
          {selectedDay && !rescheduleMode && !bookingMode && (
            <div style={{ width: 256, flexShrink: 0, borderLeft: '1px solid var(--clr-border)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--clr-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p className="font-medium" style={{ fontSize: 14 }}>{selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  {getAcademicWeek(selectedDay) && <p className="text-xs text-muted" style={{ marginTop: 2 }}>Week {getAcademicWeek(selectedDay)} of semester</p>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDay(null)} style={{ padding: 4, marginLeft: 8, flexShrink: 0 }}><X size={14} /></button>
              </div>
              <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>
                {blockedDates[toDateStr(selectedDay)] && (
                  <div style={{ background: 'color-mix(in srgb, #374151 10%, var(--clr-card))', border: '1px solid #9ca3af', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#374151', fontWeight: 500 }}>
                    {blockedDates[toDateStr(selectedDay)]}
                  </div>
                )}
                {softBlockedDates[toDateStr(selectedDay)] && (
                  <div style={{ background: 'color-mix(in srgb, #d1d5db 20%, var(--clr-card))', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                    B54 Unavailable — {softBlockedDates[toDateStr(selectedDay)]}
                  </div>
                )}
                {selectedDayExams.length === 0 && selectedDayBookings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <p className="text-sm font-medium">No exams scheduled</p>
                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                      {blockedDates[toDateStr(selectedDay)]
                        ? 'Holiday / Vacation'
                        : softBlockedDates[toDateStr(selectedDay)]
                          ? 'B54 Unavailable'
                          : 'This day is free'}
                    </p>
                  </div>
                ) : (
                  <>
                    {selectedDayExams.map(exam => <ExamPanelRow key={exam._id} exam={exam} />)}
                    {selectedDayBookings.map(b => <BookingPanelRow key={b._id} booking={b} />)}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {exams.length === 0 && (
        <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '40px 0' }}>
          No exams scheduled for this phase yet.
        </p>
      )}

      {/* Reschedule confirm dialog */}
      {rescheduleConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setRescheduleConfirm(null)}>
          <div style={{ background: 'var(--clr-card)', borderRadius: 12, padding: 24, width: 320, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-medium" style={{ marginBottom: 6 }}>Confirm Reschedule</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Move <strong>{selectedExam?.courseCode}</strong> ({selectedExam?.examType}) to{' '}
              <strong>{rescheduleConfirm.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setRescheduleConfirm(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleConfirmReschedule} disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setConfirmDelete(null)}>
          <div style={{ background: 'var(--clr-card)', borderRadius: 12, padding: 24, width: 320, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-medium" style={{ marginBottom: 6 }}>Remove Exam</h3>
            <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
              Remove <strong>{confirmDelete.courseCode}</strong> ({confirmDelete.examType}) from the schedule? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setConfirmDelete(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-sm" style={{ color: '#fff', background: '#dc2626', border: 'none', fontWeight: 500 }} onClick={handleConfirmDelete} disabled={saving}>
                {saving ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminScheduleCalendar;
