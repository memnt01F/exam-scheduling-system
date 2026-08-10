import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { getPreferences, upsertPreference } from '../services/api.js';
import { ArrowLeft, CheckCircle2, Clock, Circle, Lock, AlertCircle, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import {
  DAYS, EXAM_TYPE_OPTIONS, EMPTY_FORM, getColumnActivity,
  WeekPicker, DayToggleGroup,
} from '../components/preferences/PreferenceFormParts.jsx';

/* ── Status config (coordinator-specific) ── */

const STATUS_CONFIG = {
  not_started:      { icon: Circle,       label: 'Not Started',      color: 'var(--clr-muted)' },
  draft:            { icon: Clock,        label: 'Draft',            color: 'var(--clr-warning, #e68a00)' },
  submitted:        { icon: CheckCircle2, label: 'Submitted',        color: '#3b82f6' },
  pending_schedule: { icon: Clock,        label: 'Pending Schedule', color: 'var(--clr-warning, #e68a00)' },
  scheduled:        { icon: CheckCircle2, label: 'Scheduled',        color: 'var(--clr-primary)' },
};

/* ── Preferences Page ── */

const PreferencesPage = () => {
  const { courseCode } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { courses, phases, effectiveWeekStartDates, backendOnline } = useCourses();

  const totalWeeks = Math.min(effectiveWeekStartDates.length, 15);
  const normalizedCode = String(courseCode || '').replace(/\s+/g, '').toUpperCase();

  // Resolve course and its phase
  const course = courses.find(
    c => String(c.code || '').replace(/\s+/g, '').toUpperCase() === normalizedCode
  );
  const coursePhase = course ? phases.find(p => p.targetLevels.includes(course.level)) : null;
  const targetTermId = coursePhase?.targetTermId || null;

  // Phase timing
  const now = new Date();
  const phaseInRange   = coursePhase && new Date(coursePhase.startDate) <= now && new Date(coursePhase.endDate) >= now;
  const isPhaseActive   = !!(coursePhase?.isActive && phaseInRange);
  const isPhaseClosed   = !!(coursePhase && (!coursePhase.isActive || new Date(coursePhase.endDate) < now));
  const isPhaseUpcoming = !!(!isPhaseActive && coursePhase && new Date(coursePhase.startDate) > now);

  // Local state
  const [prefId, setPrefId]           = useState(null);
  const [prefStatus, setPrefStatus]   = useState('not_started');
  const [isEditing, setIsEditing]     = useState(true);
  const [pageLoading, setPageLoading] = useState(true);
  const [form, setForm]               = useState(EMPTY_FORM);

  // Tracks form as last loaded/saved — auto-save skips if form hasn't changed from this
  const loadedFormRef = useRef(EMPTY_FORM);

  // Fetch existing preference on mount
  useEffect(() => {
    if (!course || !targetTermId || !backendOnline) { setPageLoading(false); return; }
    getPreferences({ courseCode: normalizedCode, termId: targetTermId })
      .then(results => {
        const existing = results[0];
        if (existing) {
          const fetched = {
            examType:        existing.examType || null,
            major1Weeks:     existing.major1Weeks || [],
            major2Weeks:     existing.major2Weeks || [],
            midtermWeeks:    existing.midtermWeeks || [],
            preferredDays:   existing.preferredDays || [],
            unpreferredDays: existing.unpreferredDays || [],
            comments:        existing.comments || '',
          };
          setPrefId(existing._id);
          setPrefStatus(existing.status || 'not_started');
          setForm(fetched);
          loadedFormRef.current = fetched;
          // Submitted/scheduled → start in read-only display mode
          if (existing.status === 'submitted' || existing.status === 'scheduled') {
            setIsEditing(false);
          }
        }
      })
      .catch(() => {})
      .finally(() => setPageLoading(false));
  }, [normalizedCode, targetTermId, backendOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save: fires 800ms after any form change while in edit mode.
  // Skips saving if the form matches what was loaded from the DB (prevents spurious draft
  // creation on mount before the user has interacted with the form).
  useEffect(() => {
    if (!isEditing || !backendOnline || !course || !targetTermId) return;
    if (JSON.stringify(form) === JSON.stringify(loadedFormRef.current)) return;
    const timeout = setTimeout(() => {
      upsertPreference({
        courseCode: normalizedCode,
        termId: targetTermId,
        submittedBy: user?.email || '',
        ...form,
        status: 'draft',
      })
        .then(result => {
          setPrefId(prev => prev || result._id);
          setPrefStatus(prev => prev === 'not_started' ? 'draft' : prev);
        })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timeout);
  }, [form, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update a form field; enforces mutual exclusivity for day toggles
  const updateForm = (patch) => {
    setForm(prev => ({ ...prev, ...patch }));
    if (prefStatus === 'not_started') setPrefStatus('draft');
  };

  // Exam type change: clear weeks for columns that become inactive
  const handleExamTypeChange = (newType) => {
    const cols = getColumnActivity(newType);
    updateForm({
      examType: newType || null,
      ...(!cols.major1  && { major1Weeks:  [] }),
      ...(!cols.major2  && { major2Weeks:  [] }),
      ...(!cols.midterm && { midtermWeeks: [] }),
    });
  };

  // Day toggles with mutual exclusivity
  const handlePreferredChange = (days) => updateForm({
    preferredDays: days,
    unpreferredDays: form.unpreferredDays.filter(d => !days.includes(d)),
  });

  const handleUnpreferredChange = (days) => updateForm({
    unpreferredDays: days,
    preferredDays: form.preferredDays.filter(d => !days.includes(d)),
  });

  // Submit preferences
  const handleSubmit = async () => {
    if (!backendOnline || !course || !targetTermId) {
      toast.error('Cannot submit — backend is offline or no target term is configured.');
      return;
    }
    if (!form.examType) {
      toast.error('Please select an exam type before submitting.');
      return;
    }
    try {
      await upsertPreference({
        courseCode: normalizedCode,
        termId: targetTermId,
        submittedBy: user?.email || '',
        ...form,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      });
      setPrefStatus('submitted');
      setIsEditing(false);
      toast.success('Preferences submitted successfully.');
    } catch {
      toast.error('Failed to submit. Please try again.');
    }
  };

  // Revert submitted preference back to draft for editing
  const handleEdit = async () => {
    if (!backendOnline || !course || !targetTermId) return;
    try {
      await upsertPreference({
        courseCode: normalizedCode,
        termId: targetTermId,
        submittedBy: user?.email || '',
        ...form,
        status: 'draft',
      });
      setPrefStatus('draft');
      setIsEditing(true);
      loadedFormRef.current = form; // sync baseline so auto-save doesn't fire immediately
    } catch {
      toast.error('Failed to reopen preferences. Please try again.');
    }
  };

  // Derived display state
  const isPendingSchedule = prefStatus === 'submitted' && isPhaseClosed;
  const displayStatus = isPendingSchedule ? 'pending_schedule' : (prefStatus || 'not_started');
  const { icon: StatusIcon, label: statusLabel, color: statusColor } = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.not_started;

  const cols         = getColumnActivity(form.examType);
  const fieldLocked  = !isEditing || isPhaseClosed || prefStatus === 'scheduled';

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (!pageLoading && !course) {
    return (
      <DashboardLayout>
        <div style={{ padding: 32 }}>
          <p className="text-sm text-muted">Course <strong>{courseCode}</strong> not found.</p>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </DashboardLayout>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => navigate('/dashboard')}
              style={{ padding: '4px 10px' }}
            >
              <ArrowLeft size={14} />
            </button>
            <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {pageLoading ? '…' : `Level ${course?.level} · Coordinator Planning`}
            </p>
          </div>
          <h1 className="text-2xl font-bold">Exam Scheduling Preferences</h1>
        </div>

        {/* Warning: target term not configured */}
        {!pageLoading && !targetTermId && (
          <div className="card" style={{ borderLeft: '4px solid var(--clr-warning, #e68a00)', padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertCircle size={16} style={{ color: 'var(--clr-warning, #e68a00)', flexShrink: 0 }} />
              <p className="text-sm">
                No target term has been configured for this phase. An admin must set the target term before preferences can be submitted.
              </p>
            </div>
          </div>
        )}

        {/* Phase not open yet */}
        {!pageLoading && isPhaseUpcoming && (
          <div className="card" style={{ borderLeft: '4px solid var(--clr-muted)', padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Lock size={16} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
              <p className="text-sm">The preference submission window for this course has not opened yet.</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {pageLoading && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <p className="text-sm text-muted">Loading preferences…</p>
          </div>
        )}

        {/* Preferences table */}
        {!pageLoading && course && (
          <div className="card">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '13%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '9%'  }} />
                <col style={{ width: '9%'  }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '9%'  }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--clr-border)', background: '#f8f9fb' }}>
                  {[
                    'Course',
                    'Exam Type',
                    'Major 1 - Preferred Week',
                    'Major 2 - Preferred Week',
                    'Midterm - Preferred Week',
                    'Preferred',
                    'Unpreferred',
                    'Comments',
                    'Status',
                  ].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 8px', textAlign: 'left',
                        fontWeight: 600, fontSize: 11,
                        color: 'var(--clr-muted)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                <tr style={{ borderBottom: '1px solid var(--clr-border)', verticalAlign: 'top' }}>

                  {/* Course */}
                  <td style={{ padding: '18px 8px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{course.code}</div>
                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>{course.name}</div>
                  </td>

                  {/* Exam Type */}
                  <td style={{ padding: '18px 8px' }}>
                    <select
                      className="form-input"
                      disabled={fieldLocked}
                      value={form.examType || ''}
                      onChange={e => handleExamTypeChange(e.target.value || null)}
                      style={{ fontSize: 12, height: 30, width: '100%' }}
                    >
                      <option value="">— Select —</option>
                      {EXAM_TYPE_OPTIONS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>

                  {/* Major 1 - Preferred Week */}
                  <td style={{ padding: '18px 8px' }}>
                    <WeekPicker
                      selected={form.major1Weeks}
                      onChange={weeks => updateForm({ major1Weeks: weeks })}
                      totalWeeks={totalWeeks}
                      disabled={fieldLocked || !cols.major1}
                    />
                  </td>

                  {/* Major 2 - Preferred Week */}
                  <td style={{ padding: '18px 8px' }}>
                    <WeekPicker
                      selected={form.major2Weeks}
                      onChange={weeks => updateForm({ major2Weeks: weeks })}
                      totalWeeks={totalWeeks}
                      disabled={fieldLocked || !cols.major2}
                    />
                  </td>

                  {/* Midterm - Preferred Week */}
                  <td style={{ padding: '18px 8px' }}>
                    <WeekPicker
                      selected={form.midtermWeeks}
                      onChange={weeks => updateForm({ midtermWeeks: weeks })}
                      totalWeeks={totalWeeks}
                      disabled={fieldLocked || !cols.midterm}
                    />
                  </td>

                  {/* Preferred Days */}
                  <td style={{ padding: '18px 8px' }}>
                    <DayToggleGroup
                      selected={form.preferredDays}
                      onChange={handlePreferredChange}
                      disabledDays={form.unpreferredDays}
                      disabled={fieldLocked}
                    />
                  </td>

                  {/* Unpreferred Days */}
                  <td style={{ padding: '18px 8px' }}>
                    <DayToggleGroup
                      selected={form.unpreferredDays}
                      onChange={handleUnpreferredChange}
                      disabledDays={form.preferredDays}
                      disabled={fieldLocked}
                    />
                  </td>

                  {/* Comments */}
                  <td style={{ padding: '18px 8px' }}>
                    <textarea
                      className="form-input"
                      disabled={fieldLocked}
                      value={form.comments}
                      placeholder="Scheduling notes, building requirements, grouping constraints…"
                      rows={5}
                      onChange={e => updateForm({ comments: e.target.value })}
                      style={{ fontSize: 12, resize: 'vertical', minHeight: 110, width: '100%' }}
                    />
                  </td>

                  {/* Status + Action */}
                  <td style={{ padding: '18px 8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>

                      {/* Status badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: statusColor }}>
                        <StatusIcon size={13} />
                        <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{statusLabel}</span>
                      </div>

                      {/* Submit — while editing and phase is open */}
                      {isEditing && !isPhaseClosed && prefStatus !== 'scheduled' && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ width: '100%' }}
                          disabled={!backendOnline || !targetTermId}
                          onClick={handleSubmit}
                        >
                          Submit
                        </button>
                      )}

                      {/* Edit — after submission while phase still active */}
                      {!isEditing && isPhaseActive && prefStatus === 'submitted' && (
                        <button
                          className="btn btn-outline btn-sm"
                          style={{ width: '100%' }}
                          onClick={handleEdit}
                        >
                          <CalendarDays size={12} /> Edit
                        </button>
                      )}

                      {/* Locked */}
                      {(isPhaseClosed || prefStatus === 'scheduled') && !isEditing && (
                        <span
                          className="badge badge-outline"
                          style={{ color: 'var(--clr-muted)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <Lock size={10} /> Locked
                        </span>
                      )}

                    </div>
                  </td>

                </tr>
              </tbody>
            </table>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
};

export default PreferencesPage;
