import { useState, useEffect, useMemo, useRef } from 'react';
import { useCourses } from '../../context/CoursesContext.jsx';
import { getPreferences } from '../../services/api.js';
import { toast } from 'sonner';
import {
  Search, Bell, ChevronDown, X, Calendar, AlertTriangle,
} from 'lucide-react';

/* ── status config ── */
const STATUS_CFG = {
  Submitted:   { bg: '#dcfce7', color: '#16a34a', dot: '#16a34a' },
  Draft:       { bg: '#fef9c3', color: '#ca8a04', dot: '#eab308' },
  'Not Started':{ bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' },
};

const toDisplayStatus = (raw) => {
  if (!raw || raw === 'not_started') return 'Not Started';
  if (raw === 'submitted' || raw === 'scheduled') return 'Submitted';
  if (raw === 'draft') return 'Draft';
  return 'Not Started';
};

/* ── Row "…" menu ── */
const RowActionsMenu = ({ hasPreference, onView, onRemind }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(v => !v)}
        style={{ fontWeight: 700, letterSpacing: 2, fontSize: 16, lineHeight: 1, padding: '2px 8px' }}
      >
        •••
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4,
          background: 'var(--clr-card)', border: '1px solid var(--clr-border)',
          borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 50, minWidth: 180, padding: 4,
        }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!hasPreference}
            style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start', borderRadius: 6, opacity: hasPreference ? 1 : 0.45 }}
            onClick={() => { setOpen(false); if (hasPreference) onView(); }}
          >
            View Preferences
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start', borderRadius: 6 }}
            onClick={() => { setOpen(false); onRemind(); }}
          >
            Send Reminder
          </button>
        </div>
      )}
    </div>
  );
};

/* ── View Preferences Modal ── */
const ViewPreferencesModal = ({ row, onClose }) => {
  const { course, coordinator, pref } = row;

  const Section = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span className="text-sm">{value || <span className="text-muted">—</span>}</span>
    </div>
  );

  const WeekList = ({ label, weeks }) =>
    weeks && weeks.length > 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {weeks.map(w => (
            <span key={w} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)' }}>
              Week {w}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  const DayList = ({ label, days, variant }) =>
    days && days.length > 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {days.map(d => (
            <span key={d} style={{
              fontSize: 12, padding: '2px 8px', borderRadius: 10,
              background: variant === 'preferred' ? '#dcfce7' : '#fee2e2',
              color: variant === 'preferred' ? '#16a34a' : '#dc2626',
              border: `1px solid ${variant === 'preferred' ? '#bbf7d0' : '#fecaca'}`,
            }}>
              {d}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  const sc = STATUS_CFG[toDisplayStatus(pref.status)];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '92vw' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 className="modal-title" style={{ margin: 0 }}>{course.code}</h2>
            <p className="text-sm text-muted" style={{ marginTop: 2 }}>{course.name}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 12,
              background: sc.bg, color: sc.color, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot }} />
              {toDisplayStatus(pref.status)}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Meta row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          padding: '12px 14px', background: 'var(--clr-surface)',
          borderRadius: 8, marginBottom: 18,
        }}>
          <Section label="Coordinator" value={coordinator?.name} />
          <Section label="Submitted by" value={pref.submittedBy} />
          <Section label="Exam type" value={pref.examType} />
          <Section
            label="Last updated"
            value={pref.updatedAt
              ? new Date(pref.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : null}
          />
        </div>

        {/* Week preferences */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pref.examType === 'Three Majors' ? (
            <>
              <WeekList label="Major 1 preferred weeks" weeks={pref.major1Weeks} />
              <WeekList label="Major 2 preferred weeks" weeks={pref.major2Weeks} />
              <WeekList label="Midterm preferred weeks" weeks={pref.midtermWeeks} />
            </>
          ) : pref.examType === 'Two Majors' ? (
            <>
              <WeekList label="Major 1 preferred weeks" weeks={pref.major1Weeks} />
              <WeekList label="Major 2 preferred weeks" weeks={pref.major2Weeks} />
            </>
          ) : pref.examType === 'Midterm' ? (
            <WeekList label="Midterm preferred weeks" weeks={pref.midtermWeeks} />
          ) : null}

          <DayList label="Preferred days" days={pref.preferredDays} variant="preferred" />
          <DayList label="Unpreferred days" days={pref.unpreferredDays} variant="unpreferred" />

          {pref.comments && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comments</span>
              <p className="text-sm" style={{
                padding: '10px 12px', background: 'var(--clr-surface)',
                border: '1px solid var(--clr-border)', borderRadius: 6, margin: 0,
              }}>
                {pref.comments}
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ paddingTop: 16 }}>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

/* ── Main component ── */
const SchedulingManagement = () => {
  const { phases, academicTerms: terms, courses, users } = useCourses();

  const [selectedPhaseNum, setSelectedPhaseNum] = useState(0);
  const [selectedTermId, setSelectedTermId]     = useState('');
  const [preferences, setPreferences]           = useState([]);
  const [loadingPrefs, setLoadingPrefs]         = useState(false);

  const [search, setSearch]             = useState('');
  const [deptFilter, setDeptFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]                 = useState(1);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [viewingRow, setViewingRow]     = useState(null);
  const reminderRef = useRef(null);

  /* default to latest term */
  useEffect(() => {
    if (!selectedTermId && terms.length > 0) {
      const last = terms[terms.length - 1];
      setSelectedTermId(last._serverId || last.id);
    }
  }, [terms]);

  /* reset to page 1 when filters, phase, or term change */
  useEffect(() => { setPage(1); }, [search, deptFilter, statusFilter, selectedPhaseNum, selectedTermId]);

  /* fetch preferences when term changes */
  useEffect(() => {
    if (!selectedTermId) return;
    setLoadingPrefs(true);
    getPreferences({ termId: selectedTermId })
      .then(data => setPreferences(Array.isArray(data) ? data : []))
      .catch(() => setPreferences([]))
      .finally(() => setLoadingPrefs(false));
  }, [selectedTermId]);

  /* close reminder dropdown on outside click */
  useEffect(() => {
    const h = (e) => { if (reminderRef.current && !reminderRef.current.contains(e.target)) setReminderOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Derived data ── */

  const selectedPhase = useMemo(() =>
    phases.find(p =>
      p.phaseNumber === selectedPhaseNum &&
      String(p.targetTermId) === String(selectedTermId)
    ),
    [phases, selectedPhaseNum, selectedTermId]
  );

  const selectedTerm = useMemo(() =>
    terms.find(t => String(t._serverId || t.id) === String(selectedTermId)),
    [terms, selectedTermId]
  );

  // Phase 0 → level 1, Phase 1 → level 2
  const targetLevel = selectedPhaseNum === 0 ? 1 : 2;

  const phaseCourses = useMemo(() =>
    courses.filter(c => Number(c.level) === targetLevel),
    [courses, targetLevel]
  );

  const rows = useMemo(() => phaseCourses.map(course => {
    const coordinator = users.find(u =>
      u.role === 'coordinator' && (u.assignedCourses || []).includes(course.code)
    );
    const pref = preferences.find(p =>
      String(p.courseCode).toUpperCase() === String(course.code).toUpperCase()
    );
    const status = toDisplayStatus(pref?.status);
    return { course, coordinator, pref: pref || null, status };
  }), [phaseCourses, users, preferences]);

  const depts = useMemo(() =>
    [...new Set(phaseCourses.map(c => c.department).filter(Boolean))].sort(),
    [phaseCourses]
  );

  const filtered = useMemo(() => rows.filter(r => {
    if (deptFilter && r.course.department !== deptFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.course.code.toLowerCase().includes(q) ||
        (r.course.name || '').toLowerCase().includes(q) ||
        (r.coordinator?.name || '').toLowerCase().includes(q)
      );
    }
    return true;
  }), [rows, deptFilter, statusFilter, search]);

  /* pagination */
  const PAGE_SIZE = 25;
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  /* stats */
  const total      = rows.length;
  const submitted  = rows.filter(r => r.status === 'Submitted').length;
  const draft      = rows.filter(r => r.status === 'Draft').length;
  const notStarted = rows.filter(r => r.status === 'Not Started').length;
  const pct        = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const allSubmitted = total > 0 && submitted === total;

  const phaseStatus = selectedPhase?.isActive ? 'Open' : 'Closed';
  const closesDate  = selectedPhase?.endDate
    ? new Date(selectedPhase.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  const handleRemind = () => toast.info('Feature not yet implemented');

  return (
    <div className="space-y-4">

      {/* ── Top bar: phase switcher + term selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', gap: 4,
          background: 'var(--clr-surface)', border: '1px solid var(--clr-border)',
          borderRadius: 8, padding: 4,
        }}>
          {[0, 1].map(n => (
            <button
              key={n}
              onClick={() => setSelectedPhaseNum(n)}
              className={`btn btn-sm ${selectedPhaseNum === n ? 'btn-primary' : 'btn-ghost'}`}
              style={{ minWidth: 86 }}
            >
              Phase {n}
            </button>
          ))}
        </div>

        <select
          className="form-input"
          value={selectedTermId}
          onChange={e => setSelectedTermId(e.target.value)}
          style={{ height: 34, fontSize: 13, minWidth: 170 }}
        >
          <option value="">Select term…</option>
          {terms.map(t => {
            const tId = t._serverId || t.id;
            return <option key={tId} value={tId}>{t.name}</option>;
          })}
        </select>
      </div>

      {/* ── Phase info bar ── */}
      <div className="card">
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          padding: '10px 0',
        }}>
          {[
            { label: 'Current Phase',  value: selectedPhase?.name || `Phase ${selectedPhaseNum}` },
            { label: 'Academic Term',  value: selectedTerm?.name  || '—' },
            { label: 'Phase Status',   value: phaseStatus, withDot: true, active: selectedPhase?.isActive },
            { label: 'Closes',         value: closesDate },
          ].map(({ label, value, withDot, active }, i) => (
            <div key={i} style={{
              padding: '0 20px',
              borderRight: i < 3 ? '1px solid var(--clr-border)' : 'none',
            }}>
              <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {label}
              </p>
              <p className="text-sm font-medium" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {withDot && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: active ? 'var(--clr-primary)' : '#9ca3af',
                  }} />
                )}
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Progress card ── */}
      <div className="card">
        <div className="card-content">
          {/* Progress header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{pct}%</span>
              <span className="text-sm text-muted">complete</span>
              <span className="text-sm text-muted">·</span>
              <span className="text-sm text-muted">{submitted} of {total} courses submitted</span>
            </div>

            {/* Send Reminder dropdown */}
            <div ref={reminderRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setReminderOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Bell size={13} />
                Send Reminder
                <ChevronDown size={12} />
              </button>
              {reminderOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4,
                  background: 'var(--clr-card)', border: '1px solid var(--clr-border)',
                  borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  zIndex: 50, minWidth: 230, padding: 4,
                }}>
                  {[
                    'Remind all pending coordinators',
                    'Remind Draft only',
                    'Remind Not Started only',
                  ].map(label => (
                    <button
                      key={label}
                      className="btn btn-ghost btn-sm"
                      style={{ width: '100%', textAlign: 'left', justifyContent: 'flex-start', borderRadius: 6 }}
                      onClick={() => { setReminderOpen(false); handleRemind(); }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bar */}
          <div style={{ height: 8, background: 'var(--clr-border)', borderRadius: 4, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: 'var(--clr-primary)', borderRadius: 4,
              transition: 'width 0.35s ease',
            }} />
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Total',       value: total,      dot: '#6b7280' },
              { label: 'Submitted',   value: submitted,  dot: '#16a34a' },
              { label: 'Draft',       value: draft,      dot: '#eab308' },
              { label: 'Not Started', value: notStarted, dot: '#9ca3af' },
            ].map(({ label, value, dot }) => (
              <div key={label} style={{ border: '1px solid var(--clr-border)', borderRadius: 8, padding: '14px 16px' }}>
                <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>{value}</p>
                <p className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Course table ── */}
      <div className="card">
        <div className="card-content">
          {/* Filters row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-muted)', pointerEvents: 'none' }} />
              <input
                className="form-input"
                placeholder="Search course or coordinator…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 32, height: 34, fontSize: 13 }}
              />
            </div>

            <select
              className="form-input"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              style={{ width: 'auto', minWidth: 160, height: 34, fontSize: 13 }}
            >
              <option value="">All Departments</option>
              {depts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <select
              className="form-input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ width: 'auto', minWidth: 140, height: 34, fontSize: 13 }}
            >
              <option value="">All Statuses</option>
              {['Submitted', 'Draft', 'Not Started'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <span className="text-xs text-muted">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Table */}
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Department</th>
                  <th>Coordinator</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th style={{ width: 52 }}></th>
                </tr>
              </thead>
              <tbody>
                {loadingPrefs ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 28 }} className="text-sm text-muted">
                      Loading preferences…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 28 }} className="text-sm text-muted">
                      {total === 0
                        ? `No Level ${targetLevel} courses found. Make sure courses are configured in Reference Data.`
                        : 'No courses match the current filters.'}
                    </td>
                  </tr>
                ) : (
                  paginated.map(({ course, coordinator, pref, status }) => {
                    const sc = STATUS_CFG[status];
                    return (
                      <tr key={course.code}>
                        <td>
                          <span className="font-medium">{course.code}</span>
                          {course.name && (
                            <span className="text-xs text-muted" style={{ display: 'block', marginTop: 1 }}>{course.name}</span>
                          )}
                        </td>
                        <td className="text-sm">{course.department || <span className="text-muted">—</span>}</td>
                        <td className="text-sm">
                          {coordinator
                            ? coordinator.name
                            : <span className="text-muted">Unassigned</span>}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 9px', borderRadius: 12,
                            background: sc.bg, color: sc.color,
                            fontSize: 12, fontWeight: 500,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                            {status}
                          </span>
                        </td>
                        <td className="text-sm text-muted">
                          {pref?.updatedAt
                            ? new Date(pref.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: 8 }}>
                          <RowActionsMenu
                            hasPreference={!!pref}
                            onView={() => setViewingRow({ course, coordinator, pref })}
                            onRemind={handleRemind}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
              <span className="text-xs text-muted">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>Previous</button>
                <span className="text-xs text-muted">Page {page} of {pageCount}</span>
                <button className="btn btn-outline btn-sm" onClick={() => setPage(p => p + 1)} disabled={page === pageCount}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Schedule generation ── */}
      <div className="card">
        <div className="card-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Calendar size={15} />
              <span className="text-sm font-medium">Schedule Generation</span>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: '#f3f4f6', color: '#6b7280', fontWeight: 500,
              }}>
                Not yet implemented
              </span>
            </div>
            <p className="text-xs text-muted">
              Once all coordinators have submitted their preferences, the scheduling algorithm will generate an optimised exam timetable.
            </p>
            {!allSubmitted && total > 0 && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12,
                padding: '8px 12px',
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
              }}>
                <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: '#b45309', margin: 0 }}>
                  {notStarted + draft} course{notStarted + draft !== 1 ? 's have' : ' has'} not yet been submitted.
                  Generation is not recommended until all submissions are complete.
                </p>
              </div>
            )}
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled
            style={{ opacity: 0.45, cursor: 'not-allowed', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Calendar size={14} />
            Generate Schedule
          </button>
        </div>
      </div>

      {/* ── View Preferences Modal ── */}
      {viewingRow && (
        <ViewPreferencesModal row={viewingRow} onClose={() => setViewingRow(null)} />
      )}
    </div>
  );
};

export default SchedulingManagement;
