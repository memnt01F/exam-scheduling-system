import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCourses } from '../../context/CoursesContext.jsx';
import { getPreferences, upsertPreference, updatePreference } from '../../services/api.js';
import { toast } from 'sonner';
import { ArrowLeft, Search, CheckCircle2, Clock, Circle, Lock } from 'lucide-react';
import {
  EXAM_TYPE_OPTIONS, EMPTY_FORM, getColumnActivity,
  WeekPicker, DayToggleGroup,
} from '../preferences/PreferenceFormParts.jsx';

const STATUS_CONFIG = {
  not_started: { icon: Circle,       label: 'Not Started', color: 'var(--clr-muted)' },
  draft:       { icon: Clock,        label: 'Draft',       color: '#e68a00' },
  submitted:   { icon: CheckCircle2, label: 'Submitted',   color: '#3b82f6' },
  scheduled:   { icon: CheckCircle2, label: 'Scheduled',   color: 'var(--clr-primary)' },
};

const AdminPreferencesView = ({ phaseNum, termId, phase, term, onBack, restrictedDepts }) => {
  const { user } = useAuth();
  const { courses, users, effectiveWeekStartDates, backendOnline } = useCourses();

  const totalWeeks  = Math.min(effectiveWeekStartDates.length, 15);
  const targetLevel = phaseNum === 0 ? 1 : 2;

  const [preferences, setPreferences] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [formStates, setFormStates]   = useState({});
  const [search, setSearch]           = useState('');
  const [deptFilter, setDeptFilter]   = useState('');
  const [page, setPage]               = useState(1);

  /* fetch preferences on mount */
  useEffect(() => {
    if (!termId || !backendOnline) { setLoading(false); return; }
    setLoading(true);
    getPreferences({ termId })
      .then(data => setPreferences(Array.isArray(data) ? data : []))
      .catch(() => setPreferences([]))
      .finally(() => setLoading(false));
  }, [termId, backendOnline]);

  /* phase courses sorted alphabetically */
  const phaseCourses = useMemo(() =>
    courses
      .filter(c => Number(c.level) === targetLevel && (!restrictedDepts?.length || restrictedDepts.includes(c.department)))
      .sort((a, b) => String(a.code).localeCompare(String(b.code))),
    [courses, targetLevel, restrictedDepts]
  );

  /* build rows: course + coordinator + matched preference */
  const rows = useMemo(() => phaseCourses.map(course => {
    const coordinator = users.find(u =>
      u.role === 'coordinator' && (u.assignedCourses || []).includes(course.code)
    );
    const pref = preferences.find(p =>
      String(p.courseCode).toUpperCase() === String(course.code).toUpperCase()
    );
    return { course, coordinator, pref };
  }), [phaseCourses, users, preferences]);

  /* initialise form states when rows or loading changes */
  useEffect(() => {
    if (loading) return;
    setFormStates(prev => {
      const next = {};
      for (const { course, pref } of rows) {
        const code = course.code;
        if (prev[code]) { next[code] = prev[code]; continue; }
        const f = pref ? {
          examType:        pref.examType        || null,
          major1Weeks:     pref.major1Weeks     || [],
          major2Weeks:     pref.major2Weeks     || [],
          midtermWeeks:    pref.midtermWeeks    || [],
          preferredDays:   pref.preferredDays   || [],
          unpreferredDays: pref.unpreferredDays || [],
          comments:        pref.comments        || '',
        } : { ...EMPTY_FORM };
        const dbStatus = pref?.status || 'not_started';
        next[code] = {
          form:      f,
          isEditing: dbStatus === 'not_started' || dbStatus === 'draft',
          saving:    false,
          dbStatus,
          prefId:    pref?._id  || null,
          editedBy:  pref?.editedBy || null,
        };
      }
      return next;
    });
  }, [rows, loading]);

  const depts = useMemo(() =>
    [...new Set(phaseCourses.map(c => c.department).filter(Boolean))].sort(),
    [phaseCourses]
  );

  /* reset to page 1 when filters change */
  useEffect(() => { setPage(1); }, [search, deptFilter]);

  /* filtered rows */
  const filtered = useMemo(() => {
    let result = rows;
    if (deptFilter) result = result.filter(r => r.course.department === deptFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.course.code.toLowerCase().includes(q) ||
        (r.course.name || '').toLowerCase().includes(q) ||
        (r.coordinator?.name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, search, deptFilter]);

  /* pagination */
  const PAGE_SIZE = 25;
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  /* helpers */
  const setField = (code, patch) =>
    setFormStates(prev => ({
      ...prev,
      [code]: { ...prev[code], form: { ...prev[code].form, ...patch } },
    }));

  const handleEdit = (code) =>
    setFormStates(prev => ({ ...prev, [code]: { ...prev[code], isEditing: true } }));

  const handleSubmit = async (courseCode, coordinator) => {
    const state = formStates[courseCode];
    if (!state || state.saving || !backendOnline) return;
    if (!state.form.examType) {
      toast.error('Please select an exam type before saving.');
      return;
    }

    setFormStates(prev => ({ ...prev, [courseCode]: { ...prev[courseCode], saving: true } }));

    try {
      let result;
      const adminName = user?.name || 'admin';

      if (state.prefId) {
        /* existing preference — update by _id, preserve submittedBy */
        result = await updatePreference(state.prefId, {
          ...state.form,
          editedBy: adminName,
          status: 'submitted',
          ...(state.dbStatus !== 'submitted' && { submittedAt: new Date().toISOString() }),
        });
      } else {
        /* new preference — admin is filling in on behalf of coordinator */
        result = await upsertPreference({
          courseCode,
          termId,
          submittedBy: coordinator?.name || adminName,
          editedBy:    adminName,
          ...state.form,
          status:      'submitted',
          submittedAt: new Date().toISOString(),
        });
      }

      setFormStates(prev => ({
        ...prev,
        [courseCode]: {
          ...prev[courseCode],
          saving:    false,
          isEditing: false,
          dbStatus:  'submitted',
          prefId:    result._id,
          editedBy:  adminName,
        },
      }));
      toast.success(`Saved preferences for ${courseCode}`);
    } catch {
      setFormStates(prev => ({ ...prev, [courseCode]: { ...prev[courseCode], saving: false } }));
      toast.error(`Failed to save ${courseCode}`);
    }
  };

  const phaseActive = !!phase?.isActive;

  /* ── Render ── */

  return (
    <div className="space-y-4">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button
            className="btn btn-outline btn-sm"
            onClick={onBack}
            style={{ padding: '4px 10px', flexShrink: 0 }}
          >
            <ArrowLeft size={14} />
          </button>
        )}
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {phase?.name || `Phase ${phaseNum}`} — All Preferences
          </h2>
          <p className="text-xs text-muted" style={{ marginTop: 2 }}>
            {term?.name} · Level {targetLevel} courses · {rows.length} total
          </p>
        </div>
      </div>

      {/* Phase closed banner */}
      {!phaseActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 8,
          background: '#f3f4f6', border: '1px solid var(--clr-border)',
        }}>
          <Lock size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          <p className="text-sm" style={{ margin: 0, color: 'var(--clr-muted)' }}>
            This phase is not currently active. Preferences are view-only.
          </p>
        </div>
      )}

      {/* Search + Department filter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 420 }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--clr-muted)', pointerEvents: 'none',
          }} />
          <input
            className="form-input"
            placeholder="Search course or coordinator…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32, height: 34, fontSize: 13 }}
          />
        </div>
        {!restrictedDepts?.length && (
          <select
            className="form-input"
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ width: 'auto', minWidth: 160, height: 34, fontSize: 13 }}
          >
            <option value="">All Departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="text-sm text-muted">Loading preferences…</p>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse', fontSize: 13,
              tableLayout: 'fixed', minWidth: 900,
            }}>
              <colgroup>
                <col style={{ width: '13%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '9%'  }} />
                <col style={{ width: '9%'  }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--clr-border)', background: '#f8f9fb' }}>
                  {[
                    'Course', 'Exam Type',
                    'Major 1 - Preferred Week', 'Major 2 - Preferred Week', 'Midterm - Preferred Week',
                    'Preferred', 'Unpreferred', 'Comments', 'Status',
                  ].map(h => (
                    <th key={h} style={{
                      padding: '8px 8px', textAlign: 'left',
                      fontWeight: 600, fontSize: 11, color: 'var(--clr-muted)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 32 }} className="text-sm text-muted">
                      No courses found.
                    </td>
                  </tr>
                ) : paginated.map(({ course, coordinator, pref }) => {
                  const state = formStates[course.code];
                  if (!state) return null;

                  const { form, isEditing, saving, dbStatus, editedBy } = state;
                  const cols   = getColumnActivity(form.examType);
                  const locked = !isEditing || !phaseActive;
                  const { icon: StatusIcon, label: statusLabel, color: statusColor } =
                    STATUS_CONFIG[dbStatus] || STATUS_CONFIG.not_started;

                  const handleExamTypeChange = (val) => {
                    const c = getColumnActivity(val || null);
                    setField(course.code, {
                      examType: val || null,
                      ...(!c.major1  && { major1Weeks:  [] }),
                      ...(!c.major2  && { major2Weeks:  [] }),
                      ...(!c.midterm && { midtermWeeks: [] }),
                    });
                  };

                  const handlePreferredChange = (days) => setField(course.code, {
                    preferredDays:   days,
                    unpreferredDays: form.unpreferredDays.filter(d => !days.includes(d)),
                  });

                  const handleUnpreferredChange = (days) => setField(course.code, {
                    unpreferredDays: days,
                    preferredDays:   form.preferredDays.filter(d => !days.includes(d)),
                  });

                  return (
                    <tr key={course.code} style={{ borderBottom: '1px solid var(--clr-border)', verticalAlign: 'top' }}>

                      {/* Course */}
                      <td style={{ padding: '16px 8px' }}>
                        <div style={{ fontWeight: 700 }}>{course.code}</div>
                        {course.name && (
                          <div className="text-xs text-muted" style={{ marginTop: 2 }}>{course.name}</div>
                        )}
                        {coordinator && (
                          <div className="text-xs text-muted" style={{ marginTop: 2 }}>{coordinator.name}</div>
                        )}
                      </td>

                      {/* Exam Type */}
                      <td style={{ padding: '16px 8px' }}>
                        <select
                          className="form-input"
                          disabled={locked}
                          value={form.examType || ''}
                          onChange={e => handleExamTypeChange(e.target.value)}
                          style={{ fontSize: 12, height: 30, width: '100%' }}
                        >
                          <option value="">— Select —</option>
                          {EXAM_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>

                      {/* Major 1 */}
                      <td style={{ padding: '16px 8px' }}>
                        <WeekPicker
                          selected={form.major1Weeks}
                          onChange={weeks => setField(course.code, { major1Weeks: weeks })}
                          totalWeeks={totalWeeks}
                          disabled={locked || !cols.major1}
                        />
                      </td>

                      {/* Major 2 */}
                      <td style={{ padding: '16px 8px' }}>
                        <WeekPicker
                          selected={form.major2Weeks}
                          onChange={weeks => setField(course.code, { major2Weeks: weeks })}
                          totalWeeks={totalWeeks}
                          disabled={locked || !cols.major2}
                        />
                      </td>

                      {/* Midterm */}
                      <td style={{ padding: '16px 8px' }}>
                        <WeekPicker
                          selected={form.midtermWeeks}
                          onChange={weeks => setField(course.code, { midtermWeeks: weeks })}
                          totalWeeks={totalWeeks}
                          disabled={locked || !cols.midterm}
                        />
                      </td>

                      {/* Preferred Days */}
                      <td style={{ padding: '16px 8px' }}>
                        <DayToggleGroup
                          selected={form.preferredDays}
                          onChange={handlePreferredChange}
                          disabledDays={form.unpreferredDays}
                          disabled={locked}
                        />
                      </td>

                      {/* Unpreferred Days */}
                      <td style={{ padding: '16px 8px' }}>
                        <DayToggleGroup
                          selected={form.unpreferredDays}
                          onChange={handleUnpreferredChange}
                          disabledDays={form.preferredDays}
                          disabled={locked}
                        />
                      </td>

                      {/* Comments */}
                      <td style={{ padding: '16px 8px' }}>
                        <textarea
                          className="form-input"
                          disabled={locked}
                          value={form.comments}
                          placeholder="Notes…"
                          rows={4}
                          onChange={e => setField(course.code, { comments: e.target.value })}
                          style={{ fontSize: 12, resize: 'vertical', minHeight: 90, width: '100%' }}
                        />
                      </td>

                      {/* Status + Actions */}
                      <td style={{ padding: '16px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: statusColor }}>
                            <StatusIcon size={13} />
                            <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{statusLabel}</span>
                          </div>

                          {editedBy && (
                            <span style={{ fontSize: 10, color: 'var(--clr-muted)', textAlign: 'center', lineHeight: 1.3 }}>
                              Edited by<br />{editedBy}
                            </span>
                          )}

                          {phaseActive && isEditing && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ width: '100%' }}
                              disabled={saving || !backendOnline}
                              onClick={() => handleSubmit(course.code, coordinator)}
                            >
                              {saving ? 'Saving…' : 'Submit'}
                            </button>
                          )}

                          {phaseActive && !isEditing && (dbStatus === 'submitted' || dbStatus === 'draft') && (
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ width: '100%' }}
                              onClick={() => handleEdit(course.code)}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
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
      )}
    </div>
  );
};

export default AdminPreferencesView;
