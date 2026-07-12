import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { updateScheduledExam, deleteScheduledExam, confirmSchedule, getBookings } from '../../services/api.js';
import { toast } from 'sonner';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MAX_CHIPS = 3; // max chips shown per cell before "+N more"

const fmtCode = (code) => String(code).replace(/\(FINALPROGRAMMING\)/gi, '(lab)');

const EXAM_TYPE_COLOR = {
  'Major 1': '#14532d', // darkest
  'Major 2': '#166534',
  'Major 3': '#1a7a4c', // site primary
  'Mid':     '#16a34a', // lightest
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

const AdminScheduleCalendar = ({ exams: initialExams, termId, phaseNumber, term, onBack, readOnly = false }) => {
  const [exams, setExams]           = useState(initialExams || []);
  const [viewMode, setViewMode]     = useState('month');
  const [editExam, setEditExam]     = useState(null);
  const [editDate, setEditDate]     = useState('');
  const [editRoom, setEditRoom]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);

  // ── Term bounds ──
  const termStartLocal = term?.startDate ? localDate(term.startDate) : null;
  const termEndLocal   = term?.endDate   ? localDate(term.endDate)   : null;

  const termStartMonth = termStartLocal
    ? new Date(termStartLocal.getFullYear(), termStartLocal.getMonth(), 1) : null;
  const termEndMonth = termEndLocal
    ? new Date(termEndLocal.getFullYear(), termEndLocal.getMonth(), 1) : null;

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
  const blockedDates = useMemo(() => term?.calendarData?.blockedDates || {}, [term]);

  // ── Academic week number ──
  const getAcademicWeek = (date) => {
    if (!termStartLocal || !date) return null;
    const cellMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.round((cellMidnight - termStartLocal) / 86400000);
    if (daysDiff < 0) return null;
    if (termEndLocal && cellMidnight > termEndLocal) return null;
    return Math.floor(daysDiff / 7) + 1;
  };

  const examsOnDate = (date) => {
    if (!date) return [];
    const ds = toDateStr(date);
    return exams.filter(e => toDateStr(e.examDate) === ds);
  };

  const bookingsOnDate = (date) => {
    if (!date) return [];
    const ds = toDateStr(date);
    return bookings.filter(b => toDateStr(b.examDate) === ds);
  };

  // ── Month grid ──
  const monthGrid = useMemo(() => {
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const days  = [];
    const first = new Date(year, month, 1);
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    const last = new Date(year, month + 1, 0);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { weeks, month };
  }, [currentDate]);

  // ── Week days ──
  const weekDays = useMemo(() => {
    const start = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // ── Navigation ──
  const currentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const canGoPrev = viewMode === 'month'
    ? !termStartMonth || currentMonth > termStartMonth
    : true;
  const canGoNext = viewMode === 'month'
    ? !termEndMonth || currentMonth < termEndMonth
    : true;

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
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const ws = getWeekStart(currentDate);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const wk = getAcademicWeek(ws);
    const range = `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return wk ? `${range} · Week ${wk}` : range;
  };

  // ── Edit handlers ──
  const openEdit  = (exam) => { setEditExam(exam); setEditDate(toDateStr(exam.examDate)); setEditRoom(exam.room || ''); };
  const closeEdit = () => { setEditExam(null); setEditDate(''); setEditRoom(''); };

  const handleSaveEdit = async () => {
    if (!editDate) { toast.error('Please select a date'); return; }
    if (blockedDates[editDate]) {
      toast.error(`${editDate} is a blocked date: ${blockedDates[editDate]}`);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateScheduledExam(editExam._id, { examDate: editDate, room: editRoom, updatedBy: 'admin' });
      setExams(prev => prev.map(e => e._id === editExam._id ? { ...e, ...updated } : e));
      toast.success('Exam rescheduled');
      closeEdit();
    } catch { toast.error('Failed to save changes'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteScheduledExam(editExam._id);
      setExams(prev => prev.filter(e => e._id !== editExam._id));
      toast.success('Exam removed from schedule');
      closeEdit();
    } catch { toast.error('Failed to remove exam'); }
    finally { setSaving(false); }
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

  // ── Compact chip (in grid cell) ──
  const ExamChip = ({ exam }) => (
    <div
      onClick={(e) => { e.stopPropagation(); !isConfirmed && openEdit(exam); }}
      title={`${fmtCode(exam.courseCode)} — ${exam.examType}`}
      style={{
        background: examColor(exam.examType), color: '#fff',
        borderRadius: 3, padding: '2px 7px', fontSize: 11, fontWeight: 500,
        cursor: isConfirmed ? 'default' : 'pointer',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2,
      }}
    >
      {fmtCode(exam.courseCode)}
    </div>
  );

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

  // ── Full-width rows for the side panel ──
  const ExamPanelRow = ({ exam }) => (
    <div
      onClick={() => !isConfirmed && openEdit(exam)}
      style={{
        background: examColor(exam.examType), color: '#fff',
        borderRadius: 6, padding: '8px 12px', marginBottom: 6,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: isConfirmed ? 'default' : 'pointer', fontSize: 12, fontWeight: 500,
      }}
    >
      <span style={{ fontWeight: 600 }}>{fmtCode(exam.courseCode)}</span>
      <span style={{ opacity: 0.85, fontSize: 11 }}>{exam.examType}</span>
    </div>
  );

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

  // ── Selected day data ──
  const selectedDayExams    = selectedDay ? examsOnDate(selectedDay) : [];
  const selectedDayBookings = selectedDay ? bookingsOnDate(selectedDay) : [];

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={onBack} style={{ padding: '4px 10px', flexShrink: 0 }}>
            <ArrowLeft size={14} />
          </button>
          <div>
            <span className="font-medium" style={{ fontSize: 15 }}>Generated Schedule</span>
            {term && (
              <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                {term.name} · Phase {phaseNumber}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2, border: '1px solid var(--clr-border)', borderRadius: 6, padding: 2 }}>
            {['Month', 'Week'].map(label => {
              const mode = label.toLowerCase();
              return (
                <button
                  key={mode}
                  onClick={() => { setViewMode(mode); setSelectedDay(null); }}
                  className={`btn btn-sm ${viewMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 12, minWidth: 52 }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {readOnly ? (
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              color: 'var(--clr-muted)', border: '1px solid var(--clr-border)',
              borderRadius: 6, padding: '4px 10px',
            }}>
              VIEW ONLY
            </span>
          ) : (
            <button
              className={`btn btn-sm ${isConfirmed ? 'btn-outline' : 'btn-primary'}`}
              onClick={handleConfirm}
              disabled={confirming || isConfirmed || exams.length === 0}
              style={{ gap: 6, whiteSpace: 'nowrap' }}
            >
              <CheckCircle size={14} />
              {confirming ? 'Confirming…' : isConfirmed ? 'Confirmed' : 'Confirm Schedule'}
            </button>
          )}
        </div>
      </div>

      {/* ── Calendar card ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex' }}>

          {/* ── Left: nav + grid ── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Nav bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 20px', borderBottom: '1px solid var(--clr-border)',
            }}>
              <button className="btn btn-outline btn-sm" onClick={prevPeriod} disabled={!canGoPrev} style={{ gap: 4 }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="exam-cal-month">{periodLabel()}</span>
              <button className="btn btn-outline btn-sm" onClick={nextPeriod} disabled={!canGoNext} style={{ gap: 4 }}>
                Next <ChevronRight size={14} />
              </button>
            </div>

            {/* Month view */}
            {viewMode === 'month' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--clr-border)' }}>
                  {DAYS.map(d => (
                    <div key={d} style={{
                      padding: '8px 0', fontSize: 11, fontWeight: 600,
                      color: 'var(--clr-muted)', textAlign: 'center', letterSpacing: '0.04em',
                    }}>
                      {d}
                    </div>
                  ))}
                </div>

                {monthGrid.weeks.map((week, wi) => (
                  <div key={wi} style={{
                    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                    borderBottom: wi < monthGrid.weeks.length - 1 ? '1px solid var(--clr-border)' : 'none',
                  }}>
                    {week.map((day, di) => {
                      const inMonth     = day && day.getMonth() === monthGrid.month;
                      const isToday     = day ? toDateStr(day) === todayStr : false;
                      const isSelected  = selectedDay && day && toDateStr(day) === toDateStr(selectedDay);
                      const blockReason = day ? blockedDates[toDateStr(day)] : null;
                      const dayExams    = examsOnDate(day);
                      const dayBookings = bookingsOnDate(day);
                      const wk          = day ? getAcademicWeek(day) : null;

                      // Limit chips: fill from exams first, then bookings
                      const visibleExams    = dayExams.slice(0, MAX_CHIPS);
                      const remaining       = MAX_CHIPS - visibleExams.length;
                      const visibleBookings = dayBookings.slice(0, remaining);
                      const overflow        = (dayExams.length + dayBookings.length) - (visibleExams.length + visibleBookings.length);

                      const cellBg = isSelected
                        ? 'color-mix(in srgb, var(--clr-primary) 6%, var(--clr-card))'
                        : blockReason && inMonth
                          ? 'color-mix(in srgb, #ef4444 7%, var(--clr-card))'
                          : !inMonth ? 'var(--clr-surface)' : 'var(--clr-card)';

                      return (
                        <div
                          key={di}
                          onClick={() => day && setSelectedDay(prev => prev && toDateStr(prev) === toDateStr(day) ? null : day)}
                          style={{
                            minHeight: 90, padding: '6px 8px',
                            borderRight: di < 6 ? '1px solid var(--clr-border)' : 'none',
                            background: cellBg,
                            cursor: day ? 'pointer' : 'default',
                            outline: isSelected ? '2px solid var(--clr-primary)' : 'none',
                            outlineOffset: -2,
                            transition: 'background 0.1s',
                          }}
                        >
                          {day && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{
                                  width: 24, height: 24,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  borderRadius: '50%', fontSize: 13, lineHeight: 1,
                                  fontWeight: isToday ? 700 : 400,
                                  background: isToday ? 'var(--clr-primary)' : 'transparent',
                                  color: isToday ? '#fff' : inMonth ? 'var(--clr-text)' : 'var(--clr-muted)',
                                }}>
                                  {day.getDate()}
                                </span>
                                {wk !== null && (
                                  <span style={{ fontSize: 10, color: 'var(--clr-muted)', opacity: 0.55 }}>W{wk}</span>
                                )}
                              </div>
                              {blockReason && inMonth && (
                                <div style={{
                                  fontSize: 10, color: '#b91c1c', fontWeight: 600,
                                  marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {blockReason.length > 18 ? blockReason.slice(0, 16) + '…' : blockReason}
                                </div>
                              )}
                              {visibleExams.map(exam => <ExamChip key={exam._id} exam={exam} />)}
                              {visibleBookings.map(b => <BookingChip key={b._id} booking={b} />)}
                              {overflow > 0 && (
                                <div style={{ fontSize: 10, color: 'var(--clr-primary)', fontWeight: 600, padding: '1px 4px' }}>
                                  +{overflow} more
                                </div>
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
                      <div key={i} style={{
                        padding: '10px 0', textAlign: 'center',
                        borderRight: i < 6 ? '1px solid var(--clr-border)' : 'none',
                      }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--clr-muted)', letterSpacing: '0.04em', marginBottom: 4 }}>
                          {DAYS[i]}
                        </p>
                        <span style={{
                          display: 'inline-flex', width: 30, height: 30,
                          alignItems: 'center', justifyContent: 'center',
                          borderRadius: '50%', fontSize: 14, fontWeight: isToday ? 700 : 400,
                          background: isToday ? 'var(--clr-primary)' : 'transparent',
                          color: isToday ? '#fff' : 'var(--clr-text)',
                        }}>
                          {day.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {weekDays.map((day, i) => {
                    const isSelected  = selectedDay && toDateStr(day) === toDateStr(selectedDay);
                    const blockReason = blockedDates[toDateStr(day)];
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedDay(prev => prev && toDateStr(prev) === toDateStr(day) ? null : day)}
                        style={{
                          minHeight: 200, padding: '8px 6px',
                          borderRight: i < 6 ? '1px solid var(--clr-border)' : 'none',
                          cursor: 'pointer',
                          background: isSelected
                            ? 'color-mix(in srgb, var(--clr-primary) 6%, var(--clr-card))'
                            : blockReason
                              ? 'color-mix(in srgb, #ef4444 7%, var(--clr-card))'
                              : 'var(--clr-card)',
                          outline: isSelected ? '2px solid var(--clr-primary)' : 'none',
                          outlineOffset: -2,
                        }}
                      >
                        {blockReason && (
                          <div style={{
                            fontSize: 10, color: '#b91c1c', fontWeight: 600,
                            marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {blockReason.length > 22 ? blockReason.slice(0, 20) + '…' : blockReason}
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

          {/* ── Right: day detail panel ── */}
          {selectedDay && (
            <div style={{
              width: 256, flexShrink: 0,
              borderLeft: '1px solid var(--clr-border)',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Panel header */}
              <div style={{
                padding: '14px 16px', borderBottom: '1px solid var(--clr-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <div>
                  <p className="font-medium" style={{ fontSize: 14 }}>
                    {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                  {getAcademicWeek(selectedDay) && (
                    <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                      Week {getAcademicWeek(selectedDay)} of semester
                    </p>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedDay(null)}
                  style={{ padding: 4, marginLeft: 8, flexShrink: 0 }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Panel body */}
              <div style={{ flex: 1, padding: '12px 14px', overflowY: 'auto' }}>
                {blockedDates[toDateStr(selectedDay)] && (
                  <div style={{
                    background: 'color-mix(in srgb, #ef4444 10%, var(--clr-card))',
                    border: '1px solid #fca5a5',
                    borderRadius: 6, padding: '8px 12px', marginBottom: 10,
                    fontSize: 12, color: '#b91c1c', fontWeight: 500,
                  }}>
                    {blockedDates[toDateStr(selectedDay)]}
                  </div>
                )}
                {selectedDayExams.length === 0 && selectedDayBookings.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <p className="text-sm font-medium">No exams scheduled</p>
                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>This day is free</p>
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

      {/* ── Edit modal ── */}
      {editExam && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={closeEdit}
        >
          <div
            style={{ background: 'var(--clr-card)', borderRadius: 12, padding: 24, width: 340, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 className="font-medium" style={{ marginBottom: 2 }}>Edit Exam</h3>
                <p className="text-xs text-muted">{editExam.courseCode} — {editExam.examType}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeEdit} style={{ padding: 4 }}><X size={14} /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>Exam Date</label>
                <input type="date" className="form-input" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ height: 36, fontSize: 13 }} />
              </div>
              <div>
                <label className="text-xs text-muted" style={{ display: 'block', marginBottom: 4 }}>Room (optional)</label>
                <input type="text" className="form-input" placeholder="e.g. 24-133" value={editRoom} onChange={e => setEditRoom(e.target.value)} style={{ height: 36, fontSize: 13 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
              <button className="btn btn-sm" onClick={handleDelete} disabled={saving} style={{ color: '#dc2626', border: '1px solid #fecaca', background: '#fff1f2', fontWeight: 500 }}>
                Remove
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={closeEdit} disabled={saving}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminScheduleCalendar;
