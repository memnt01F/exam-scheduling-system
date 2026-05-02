import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { anchorEligibleCourses, ANCHOR_EXAM_TYPES } from '../lib/anchor-courses.js';
import { toast } from 'sonner';
import {
  Eye, Filter, Settings2, Calendar, Users, Download, ClipboardList,
  ChevronDown, ChevronUp, Search, Plus, X,
} from 'lucide-react';

const tabs = [
  { id: 'overview', label: 'Booking Overview', icon: Eye },
  { id: 'level1', label: 'Level 1 Config', icon: Settings2 },
  { id: 'phases', label: 'Phase Management', icon: Calendar },
  { id: 'proctors', label: 'Proctor Summary', icon: Users },
  { id: 'schedule', label: 'Final Schedule', icon: Download },
  { id: 'audit', label: 'Activity Log', icon: ClipboardList },
];

/** Flatten courses with bookings into one row per booking entry. */
function flattenBookings(courses) {
  const rows = [];
  courses.forEach(c => {
    Object.entries(c.bookings).forEach(([examType, b]) => {
      rows.push({ ...c, examType, week: b.week, day: b.day, maleProctors: b.maleProctors, femaleProctors: b.femaleProctors, bookedAt: b.bookedAt });
    });
  });
  return rows;
}

/* ── Booking Overview Tab (FR-SC1 + FR-SC2) ── */
const BookingOverview = ({ courses, formatSlotDate }) => {
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterWeek, setFilterWeek] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const bookedRows = flattenBookings(courses);

  // Derive unique departments for dropdown
  const departments = [...new Set(bookedRows.map(c => c.department))].sort();
  // Derive unique weeks and days
  const weeks = [...new Set(bookedRows.map(c => c.week).filter(Boolean))].sort((a, b) => a - b);
  const days = [...new Set(bookedRows.map(c => c.day).filter(Boolean))].sort((a, b) => a - b);

  const filtered = bookedRows.filter(c => {
    if (filterLevel !== 'all' && c.level !== parseInt(filterLevel)) return false;
    if (filterDept !== 'all' && c.department !== filterDept) return false;
    if (filterWeek !== 'all' && c.week !== parseInt(filterWeek)) return false;
    if (filterDay !== 'all' && c.day !== parseInt(filterDay)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase().replace(/\s+/g, '');
      const codeNorm = c.code.toLowerCase().replace(/\s+/g, '');
      if (!codeNorm.includes(q) && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--clr-muted)' }} />
          <input
            className="form-input"
            placeholder="Search course code or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: 120, flex: '0 1 140px' }}
          value={filterLevel}
          onChange={e => setFilterLevel(e.target.value)}
        >
          <option value="all">All Levels</option>
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
          <option value="3">Level 3</option>
          <option value="4">Level 4</option>
        </select>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: 140, flex: '0 1 180px' }}
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
        >
          <option value="all">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: 100, flex: '0 1 120px' }}
          value={filterWeek}
          onChange={e => setFilterWeek(e.target.value)}
        >
          <option value="all">All Weeks</option>
          {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
        </select>
        <select
          className="form-input"
          style={{ width: 'auto', minWidth: 100, flex: '0 1 120px' }}
          value={filterDay}
          onChange={e => setFilterDay(e.target.value)}
        >
          <option value="all">All Days</option>
          {days.map(d => <option key={d} value={d}>Day {d}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <p className="text-sm text-muted mb-2">{filtered.length} booking(s) found</p>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted text-center" style={{ padding: 24 }}>No bookings match your filters.</p>
          ) : (
            <div className="data-table-wrap"><table className="data-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Level</th>
                  <th>Exam Type</th>
                  <th>Department</th>
                  <th>Week</th>
                   <th>Date</th>
                   <th>Male P.</th>
                  <th>Female P.</th>
                  <th>Booked On</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={`${c.id}-${c.examType}`}>
                    <td><strong>{c.code}</strong> <span className="text-muted">{c.name}</span></td>
                    <td><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                    <td><span className="badge badge-outline" style={{ fontSize: 10 }}>{c.examType}</span></td>
                    <td className="text-sm">{c.department}</td>
                    <td>{c.week}</td>
                    <td>{(c.week && c.day) ? formatSlotDate(c.week, c.day) : '—'}</td>
                    <td>{c.maleProctors ?? '—'}</td>
                    <td>{c.femaleProctors ?? '—'}</td>
                    <td className="text-xs text-muted">
                      {c.bookedAt ? new Date(c.bookedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Level 1 Config Tab (FR-SC3) ── */
const Level1Config = ({ formatSlotDate }) => {
  const { anchorSlots, courses, refreshAnchors, refreshBookings } = useCourses();
  const navigate = useNavigate();

  // Refresh anchor slots and bookings when this tab is opened
  // so the status reflects what's actually in MongoDB
  useEffect(() => {
    refreshAnchors?.();
    refreshBookings?.();
  }, []);

  const normalizeCode = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();

  // Anchor slots (committee-fixed planned slots)
  const slotMap = {};
  anchorSlots.forEach(s => {
    const codeKey = normalizeCode(s.courseCode);
    if (!codeKey) return;
    if (!slotMap[codeKey]) slotMap[codeKey] = {};
    slotMap[codeKey][s.examType] = s;
  });

  // Authoritative bookings (actual scheduled bookings from MongoDB)
  const bookingMap = {};
  courses.forEach(c => {
    const codeKey = normalizeCode(c.code);
    if (!codeKey) return;
    bookingMap[codeKey] = c.bookings || {};
  });

  const goToBooking = (courseCode, examType) => {
    const course = courses.find(c => normalizeCode(c.code) === normalizeCode(courseCode));
    if (!course) {
      toast.error(`Course ${courseCode} not found. Make sure it has been added in Reference Data.`);
      return;
    }
    navigate(`/booking/${course.id}?from=committee${examType ? `&examType=${encodeURIComponent(examType)}` : ''}`);
  };

  // Determine booking status for a course
  const getStatus = (code) => {
    const bookings = bookingMap[normalizeCode(code)] || {};
    const hasMid = !!bookings['Mid'];
    const hasMajor1 = !!bookings['Major 1'];
    const hasMajor2 = !!bookings['Major 2'];
    if (hasMid) return 'fully_booked';
    if (hasMajor1 && hasMajor2) return 'fully_booked';
    if (hasMajor1 || hasMajor2) return 'partially_booked';
    return 'not_booked';
  };

  // What exam type to book next — only missing ones
  const getNextExamType = (code) => {
    const bookings = bookingMap[normalizeCode(code)] || {};
    if (!bookings['Major 1'] && !bookings['Major 2']) return 'Major 1';
    if (!bookings['Major 1']) return 'Major 1';
    if (!bookings['Major 2']) return 'Major 2';
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Settings2 size={16} /> Level 1 — Committee-Fixed Courses</div>
        </div>
        <div className="card-content">
          <p className="text-sm text-muted mb-2">
            Pre-configured exam slots for committee-fixed courses. Assign booking details for each course before Phase 1 opens.
          </p>
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Name</th>
                <th>Bookings</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {anchorEligibleCourses.map(c => {
                const codeKey = normalizeCode(c.code);
                const slots = slotMap[codeKey] || {};
                const bookings = bookingMap[codeKey] || {};
                const status = getStatus(c.code);
                const nextType = getNextExamType(c.code);

                return (
                  <tr key={c.code}>
                    <td><strong>{c.code}</strong></td>
                    <td>{c.name}</td>

                    {/* Booking slots summary */}
                    <td>
                      {bookings['Mid'] ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span className="badge badge-outline" style={{ fontSize: 10, borderColor: 'var(--clr-primary)', color: 'var(--clr-primary)' }}>
                            Mid ✓ {formatSlotDate(bookings['Mid'].week, bookings['Mid'].day)}
                          </span>
                        </div>
                      ) : (bookings['Major 1'] || bookings['Major 2'] || slots['Major 1'] || slots['Major 2']) ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge badge-outline" style={{
                            fontSize: 10,
                            borderColor: bookings['Major 1'] ? 'var(--clr-primary)' : undefined,
                            color: bookings['Major 1'] ? 'var(--clr-primary)' : undefined,
                          }}>
                            Major 1 {bookings['Major 1'] ? `✓ ${formatSlotDate(bookings['Major 1'].week, bookings['Major 1'].day)}` : '○ Pending'}
                          </span>
                          <span className="badge badge-outline" style={{
                            fontSize: 10,
                            borderColor: bookings['Major 2'] ? 'var(--clr-primary)' : undefined,
                            color: bookings['Major 2'] ? 'var(--clr-primary)' : undefined,
                          }}>
                            Major 2 {bookings['Major 2'] ? `✓ ${formatSlotDate(bookings['Major 2'].week, bookings['Major 2'].day)}` : '○ Pending'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td>
                      {status === 'fully_booked' && (
                        <span className="badge badge-primary" style={{ fontSize: 10 }}>Booked</span>
                      )}
                      {status === 'partially_booked' && (
                        <span className="badge" style={{ fontSize: 10, background: 'var(--clr-warning-bg, #fff7e6)', color: 'var(--clr-warning, #e68a00)' }}>
                          Partial Booking
                        </span>
                      )}
                      {status === 'not_booked' && (
                        <span className="badge badge-outline" style={{ fontSize: 10 }}>Not Booked</span>
                      )}
                    </td>

                    {/* Action */}
                    <td>
                      {status === 'fully_booked' ? (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => goToBooking(c.code, bookings['Mid'] ? 'Mid' : 'Major 1')}
                        >
                          Edit
                        </button>
                      ) : status === 'partially_booked' ? (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => goToBooking(c.code, nextType)}
                        >
                          Complete Booking →
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => goToBooking(c.code, 'Major 1')}
                        >
                          Book
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
};



/* ── Phase Management Tab (FR-SC4) ── */
const PhaseManagement = () => {
  const { phases, saveAllPhases, addAuditLog } = useCourses();
  const { user } = useAuth();
  const [localPhases, setLocalPhases] = useState(phases.map(p => ({ ...p })));

  // Sync local state when context phases change (e.g. admin updated them)
  useEffect(() => {
    setLocalPhases(phases.map(p => ({ ...p })));
  }, [phases]);

  return (
    <div className="space-y-4">
      {localPhases.map((phase, idx) => (
        <div className="card" key={phase.id}>
          <div className="card-content" style={{ paddingTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 className="text-sm font-semibold">{phase.name}</h3>
                <p className="text-xs text-muted mt-1">{phase.description}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge ${phase.isActive ? 'badge-primary' : 'badge-outline'}`}>
                  {phase.isActive ? 'Active' : 'Inactive'}
                </span>
                {phase.id !== 'p0' && (
                  <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={phase.isActive}
                      onChange={() => {
                        const updated = [...localPhases];
                        updated[idx] = { ...updated[idx], isActive: !updated[idx].isActive };
                        setLocalPhases(updated);
                      }}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    />
                    <span style={{
                      position: 'absolute', inset: 0, borderRadius: 9999, zIndex: 1,
                      backgroundColor: phase.isActive ? '#22c55e' : '#cbd5e1',
                      transition: 'background-color 0.2s',
                    }} />
                    <span style={{
                      position: 'absolute', top: 2, left: phase.isActive ? 22 : 2, zIndex: 2,
                      width: 20, height: 20, borderRadius: '50%',
                      backgroundColor: '#ffffff', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </label>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={phase.startDate}
                  onChange={e => {
                    const updated = [...localPhases];
                    updated[idx] = { ...updated[idx], startDate: e.target.value };
                    setLocalPhases(updated);
                  }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <input
                  className="form-input"
                  type="date"
                  value={phase.endDate}
                  onChange={e => {
                    const updated = [...localPhases];
                    updated[idx] = { ...updated[idx], endDate: e.target.value };
                    setLocalPhases(updated);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-primary" onClick={async () => {
        // Log phase changes
        localPhases.forEach((lp, idx) => {
          const old = phases[idx];
          if (!old) return;
          if (lp.isActive !== old.isActive) {
            addAuditLog({
              action: lp.isActive ? 'phase_activated' : 'phase_deactivated',
              user: user?.name || 'Committee',
              details: `${lp.name} ${lp.isActive ? 'activated' : 'deactivated'}`,
            });
          } else if (lp.startDate !== old.startDate || lp.endDate !== old.endDate) {
            addAuditLog({
              action: 'phase_updated',
              user: user?.name || 'Committee',
              details: `${lp.name} dates updated to ${lp.startDate} — ${lp.endDate}`,
            });
          }
        });
        const result = await saveAllPhases(localPhases.map(p => ({ ...p, updatedBy: user?.name || 'Committee', role: 'committee' })));
        toast.success(result?.offline ? 'Phase configuration saved (local only — backend offline)' : 'Phase configuration saved');
      }}>Save Phase Configuration</button>
    </div>
  );
};

/* ── Proctor Summary Tab (FR-SC5) ── */
const ProctorSummary = ({ courses, formatSlotDate }) => {
  const bookedRows = flattenBookings(courses);

  const dayTotals = {};
  bookedRows.forEach(r => {
    const key = `W${r.week}-D${r.day}`;
    if (!dayTotals[key]) dayTotals[key] = { week: r.week, day: r.day, male: 0, female: 0, courses: [] };
    dayTotals[key].male += r.maleProctors || 0;
    dayTotals[key].female += r.femaleProctors || 0;
    dayTotals[key].courses.push(`${r.code} (${r.examType})`);
  });

  const sorted = Object.values(dayTotals).sort((a, b) => a.week - b.week || a.day - b.day);
  const totalMale = sorted.reduce((s, d) => s + d.male, 0);
  const totalFemale = sorted.reduce((s, d) => s + d.female, 0);

  return (
    <div className="space-y-4">
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        <div className="card">
          <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
            <p className="stat-value">{totalMale}</p>
            <p className="stat-label">Total Male Proctors</p>
          </div>
        </div>
        <div className="card">
          <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
            <p className="stat-value">{totalFemale}</p>
            <p className="stat-label">Total Female Proctors</p>
          </div>
        </div>
        <div className="card">
          <div className="card-content" style={{ paddingTop: 20, paddingBottom: 16 }}>
            <p className="stat-value text-primary">{totalMale + totalFemale}</p>
            <p className="stat-label">Grand Total</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Courses</th>
                <th>Male Proctors</th>
                <th>Female Proctors</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(d => (
                <tr key={`${d.week}-${d.day}`}>
                  <td><strong>Week {d.week}, {formatSlotDate(d.week, d.day)}</strong></td>
                  <td className="text-sm">{d.courses.join(', ')}</td>
                  <td>{d.male}</td>
                  <td>{d.female}</td>
                  <td><strong>{d.male + d.female}</strong></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
};

/* ── Final Schedule Tab (FR-SC6) ── */
const FinalSchedule = ({ courses, formatSlotDate }) => {
  const bookedRows = flattenBookings(courses).sort((a, b) => (a.week - b.week) || (a.day - b.day));

  const handleExport = () => {
    const headers = ['Course Code', 'Course Name', 'Level', 'Exam Type', 'Department', 'Week', 'Day', 'Male Proctors', 'Female Proctors'];
    const rows = bookedRows.map(c => [c.code, c.name, c.level, c.examType, c.department, c.week, c.day, c.maleProctors || 0, c.femaleProctors || 0]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'exam_schedule.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="text-sm text-muted">{bookedRows.length} booking(s) scheduled</p>
        <button className="btn btn-primary btn-sm" onClick={handleExport}>
          <Download size={14} /> Export CSV
        </button>
      </div>
      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Level</th>
                <th>Exam Type</th>
                 <th>Date</th>
                <th>Male P.</th>
                <th>Female P.</th>
              </tr>
            </thead>
            <tbody>
              {bookedRows.map(c => (
                <tr key={`${c.id}-${c.examType}`}>
                  <td><strong>{c.code}</strong> <span className="text-muted text-xs">{c.name}</span></td>
                  <td><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                  <td><span className="badge badge-outline" style={{ fontSize: 10 }}>{c.examType}</span></td>
                   <td>{(c.week && c.day) ? `Week ${c.week}, ${formatSlotDate(c.week, c.day)}` : '—'}</td>
                  <td>{c.maleProctors ?? '—'}</td>
                  <td>{c.femaleProctors ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
};

/* ── Audit Log Tab (FR-SC7) ── */
const AuditLog = () => {
  const { auditLogs } = useCourses();
  const actionLabels = {
    booking_created: 'Booking Created',
    booking_rescheduled: 'Booking Rescheduled',
    booking_deleted: 'Booking Deleted',
    booking_conflict: 'Booking Conflict',
    phase_activated: 'Phase Activated',
    phase_deactivated: 'Phase Deactivated',
    phase_updated: 'Phase Updated',
    level1_configured: 'Level 1 Configured',
    level1_removed: 'Level 1 Removed',
    user_role_changed: 'User Updated',
    user_deactivated: 'User Deactivated',
    user_activated: 'User Activated',
    user_deleted: 'User Deleted',
    user_created: 'User Created',
    course_created: 'Course Created',
    course_updated: 'Course Updated',
    course_deleted: 'Course Deleted',
    term_created: 'Term Created',
    term_activated: 'Term Activated',
  };

  return (
    <div className="card">
      <div className="card-content" style={{ paddingTop: 16 }}>
        <div className="data-table-wrap"><table className="data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>User</th>
              <th>Course</th>
              <th>Details</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map(log => (
              <tr key={log.id}>
                <td><span className="badge badge-secondary">{actionLabels[log.action] || log.action}</span></td>
                <td className="text-sm">{log.user}</td>
                <td className="text-sm font-medium">{log.course}</td>
                <td className="text-sm text-muted">{log.details}</td>
                <td className="text-xs text-muted">
                  {new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

/* ── Main Committee Dashboard ── */
const CommitteeDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const { courses, examSlots, formatSlotDate } = useCourses();

  // Persist active tab in the URL (?tab=...) so refresh/back/forward keep state.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    const valid = tabs.some(t => t.id === tab);
    if (valid && tab !== activeTab) setActiveTab(tab);
    // If invalid, silently ignore and keep default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTab = (tabId) => {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  const renderTab = () => {
    switch (activeTab) {
       case 'overview': return <BookingOverview courses={courses} formatSlotDate={formatSlotDate} />;
       case 'level1': return <Level1Config formatSlotDate={formatSlotDate} />;
       case 'phases': return <PhaseManagement />;
       case 'proctors': return <ProctorSummary courses={courses} formatSlotDate={formatSlotDate} />;
       case 'schedule': return <FinalSchedule courses={courses} formatSlotDate={formatSlotDate} />;
      case 'audit': return <AuditLog />;
      default: return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scheduling Committee</h1>
          <p className="text-sm text-muted mt-1">Oversee exam scheduling across all phases and course levels</p>
        </div>

        <div className="tab-bar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
                onClick={() => setTab(tab.id)}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {renderTab()}
      </div>
    </DashboardLayout>
  );
};

export default CommitteeDashboard;
