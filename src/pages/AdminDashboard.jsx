import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { departments } from '../lib/mock-admin-data.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Users, Settings, Database, ClipboardList, BookOpen, Trash2, Plus, X, Pencil, Upload, FileSpreadsheet, RefreshCw, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import UserManagement from '../components/admin/UserManagement.jsx';
import ReferenceData from '../components/admin/ReferenceData.jsx';
import SchedulingManagement from '../components/admin/SchedulingManagement.jsx';
import AddTermModal from '../components/admin/AddTermModal.jsx';
import { getEnrollmentStats, uploadEnrollments } from '../services/api.js';

const tabs = [
  { id: 'users',      label: 'User Management',      icon: Users },
  { id: 'settings',   label: 'System Settings',       icon: Settings },
  { id: 'refdata',    label: 'Reference Data',        icon: Database },
  { id: 'scheduling', label: 'Scheduling Management', icon: Calendar },
  { id: 'audit',      label: 'Audit Logs',            icon: ClipboardList },
  { id: 'bookings',   label: 'Bookings',              icon: BookOpen },
];

/* (AddTermModal is now imported from src/components/admin/AddTermModal.jsx) */

/* ── Manage Phases Modal ── */
const ManagePhasesModal = ({ term, allPhases, onClose, onSave, onInit }) => {
  const termId = term._serverId || term.id;
  const termPhases = allPhases.filter(p => String(p.targetTermId) === String(termId));
  const [local, setLocal] = useState(termPhases.map(p => ({ ...p })));
  const [saving, setSaving] = useState(false);
  const [initing, setIniting] = useState(false);

  useEffect(() => {
    const fresh = allPhases.filter(p => String(p.targetTermId) === String(termId));
    setLocal(fresh.map(p => ({ ...p })));
  }, [allPhases, termId]);

  const update = (idx, field, val) =>
    setLocal(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
  };

  const handleInit = async () => {
    setIniting(true);
    await onInit(termId);
    setIniting(false);
  };

  const PHASE_LABELS = { 0: 'Level 1 courses', 1: 'Level 2 courses', 2: 'Levels 3 & 4 courses' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, width: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Phases — Term {term.name}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        {local.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p className="text-sm text-muted" style={{ marginBottom: 16 }}>No phases configured for this term yet.</p>
            <button className="btn btn-primary btn-sm" onClick={handleInit} disabled={initing}>
              {initing ? 'Initializing…' : 'Initialize Phases'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {local.map((phase, idx) => (
              <div key={phase.id || idx} style={{ border: '1px solid var(--clr-border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div>
                    <span className="text-sm font-medium">{phase.name}</span>
                    <span className="text-xs text-muted" style={{ marginLeft: 8 }}>{PHASE_LABELS[phase.phaseNumber] || ''}</span>
                  </div>
                  {/* Active toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="text-xs text-muted">{phase.isActive ? 'Active' : 'Inactive'}</span>
                    <button
                      type="button"
                      onClick={() => update(idx, 'isActive', !phase.isActive)}
                      style={{
                        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                        background: phase.isActive ? 'var(--clr-primary)' : 'var(--clr-border)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3,
                        left: phase.isActive ? 21 : 3,
                        width: 16, height: 16, borderRadius: '50%', background: 'white',
                        transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="text-xs text-muted">Start Date</label>
                    <input className="form-input" type="date" value={phase.startDate || ''} onChange={e => update(idx, 'startDate', e.target.value)} style={{ height: 32, fontSize: 13, marginTop: 3 }} />
                  </div>
                  <div>
                    <label className="text-xs text-muted">End Date</label>
                    <input className="form-input" type="date" value={phase.endDate || ''} onChange={e => update(idx, 'endDate', e.target.value)} style={{ height: 32, fontSize: 13, marginTop: 3 }} />
                  </div>
                </div>
              </div>
            ))}
            <div className="modal-footer" style={{ paddingTop: 4 }}>
              <button className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── System Settings (FR-SA3) ── */
const SystemSettings = () => {
  const {
    phases, saveTermPhases, initPhasesForTerm, addAuditLog,
    academicTerms: terms, addAcademicTerm, updateAcademicTerm, deleteAcademicTerm,
    activateTermCalendar,
  } = useCourses();
  const { user } = useAuth();
  const [managingPhasesTerm, setManagingPhasesTerm] = useState(null);

  const [showAddTerm, setShowAddTerm]             = useState(false);
  const [editingTerm, setEditingTerm]             = useState(null);
  const [confirmDeleteTerm, setConfirmDeleteTerm] = useState(null);

  // Enrollment upload state
  const [enrollmentStats, setEnrollmentStats] = useState([]);
  const [uploading, setUploading]             = useState(false);
  const [confirmReplace, setConfirmReplace]   = useState(null);

  useEffect(() => {
    getEnrollmentStats()
      .then(data => setEnrollmentStats(data.stats || []))
      .catch(() => {});
  }, []);

  const handleEnrollmentUploadForTerm = (termId, termName, file) => {
    const existing = enrollmentStats.find(s => String(s.termId) === String(termId));
    if (existing && existing.count > 0) {
      setConfirmReplace({ termId, termName, existingCount: existing.count, file });
      return;
    }
    doEnrollmentUpload(termId, file);
  };

  const doEnrollmentUpload = async (termId, file) => {
    setUploading(true);
    try {
      const result = await uploadEnrollments(termId, file, user?.name || 'admin');
      const skippedNote = result.skipped > 0 ? ` (${result.skipped.toLocaleString()} rows skipped — missing ID or course code)` : '';
      toast.success(`${result.inserted.toLocaleString()} enrollments uploaded for ${result.termName}${skippedNote}`);
      const data = await getEnrollmentStats();
      setEnrollmentStats(data.stats || []);
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setConfirmReplace(null);
    }
  };

  const statusLabel = (t) => {
    const now = new Date();
    const start = t.startDate ? new Date(t.startDate) : null;
    const end   = t.endDate   ? new Date(t.endDate)   : null;
    if (start && end) {
      if (now < start) return 'Upcoming';
      if (now <= end)  return 'Active';
      return 'Past';
    }
    if (t.status === 'upcoming') return 'Upcoming';
    return t.isActive ? 'Active' : 'Past';
  };
  const statusClass = (t) => {
    const label = statusLabel(t);
    if (label === 'Upcoming') return 'badge-secondary';
    if (label === 'Active')   return 'badge-primary';
    return 'badge-outline';
  };

  /* ── Add term ── */
  const handleAddTerm = async (newTerm) => {
    if (newTerm.isActive && newTerm.calendarData) activateTermCalendar(newTerm.calendarData);
    await addAcademicTerm(newTerm, user?.name || 'Admin');
    setShowAddTerm(false);
    toast.success('Academic term added successfully');
  };

  /* ── Edit term ── */
  const handleEditTerm = async (data) => {
    const id = editingTerm._serverId || editingTerm.id;
    const result = await updateAcademicTerm(id, data, user?.name || 'Admin');
    if (result.success) {
      toast.success('Term updated successfully');
      setEditingTerm(null);
    } else {
      toast.error(result.error || 'Failed to update term');
    }
  };

  /* ── Delete term ── */
  const handleConfirmDelete = async () => {
    const id = confirmDeleteTerm._serverId || confirmDeleteTerm.id;
    const result = await deleteAcademicTerm(id, user?.name || 'Admin');
    if (result.success) {
      toast.success(`"${confirmDeleteTerm.name}" deleted`);
    } else {
      toast.error(result.error || 'Failed to delete term');
    }
    setConfirmDeleteTerm(null);
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><Settings size={16} /> Academic Terms</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddTerm(true)}>
            <Plus size={14} /> Add Term
          </button>
        </div>
        <div className="card-content">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Term</th><th>Start</th><th>End</th><th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {terms.map(t => (
                  <tr key={t.id}>
                    <td className="font-medium">{t.name}</td>
                    <td>{t.startDate}</td>
                    <td>{t.endDate}</td>
                    <td>
                      <span className={`badge ${statusClass(t)}`} style={{ fontSize: 10 }}>
                        {statusLabel(t)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setManagingPhasesTerm(t)}
                        >
                          <Settings size={12} /> Manage Phases
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Edit term"
                          onClick={() => setEditingTerm(t)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Delete term"
                          style={{ color: 'var(--clr-danger, #dc2626)' }}
                          onClick={() => setConfirmDeleteTerm(t)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Enrollment Data */}
      <div className="card" style={{ position: 'relative' }}>
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.82)', borderRadius: 'inherit', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-primary)' }} />
            <span className="text-sm font-medium">Uploading enrollments — please wait…</span>
            <span className="text-xs text-muted">This may take a moment for large files.</span>
          </div>
        )}
        <div className="card-header">
          <div className="card-title"><FileSpreadsheet size={16} /> Enrollment Data</div>
        </div>
        <div className="card-content">
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Upload student enrollment files for each term. The system uses this data for conflict detection during scheduling.
          </p>
          <div className="data-table-wrap">
            <table className="data-table">
              <tbody>
                {terms.map(t => {
                  const termId = t._serverId || t.id;
                  const stat = enrollmentStats.find(s => String(s.termId) === String(termId));
                  const hasData = stat && stat.count > 0;
                  return (
                    <tr key={termId}>
                      <td>
                        <div className="font-medium">{t.name}</div>
                        {hasData && (
                          <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                            {stat.count.toLocaleString()} enrollments &bull; Uploaded {new Date(stat.lastUpdated).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', width: 1, whiteSpace: 'nowrap' }}>
                        <label
                          className={`btn ${hasData ? 'btn-outline' : 'btn-primary'} btn-sm`}
                          title="Only .xlsx files are accepted. Student IDs are masked before storage."
                          style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.5 : 1 }}
                        >
                          <Upload size={13} /> {hasData ? 'Replace' : 'Upload'}
                          <input
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            disabled={uploading}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleEnrollmentUploadForTerm(termId, t.name, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Manage Phases modal */}
      {managingPhasesTerm && (
        <ManagePhasesModal
          term={managingPhasesTerm}
          allPhases={phases}
          onClose={() => setManagingPhasesTerm(null)}
          onSave={async (termPhases) => {
            const result = await saveTermPhases(termPhases.map(p => ({ ...p, updatedBy: user?.name || 'Admin' })));
            toast.success(result?.offline ? 'Phases saved (local only)' : 'Phases saved');
            setManagingPhasesTerm(null);
          }}
          onInit={async (termId) => {
            const result = await initPhasesForTerm(termId);
            if (!result.success) toast.error(result.error || 'Failed to initialize phases');
          }}
        />
      )}

      {/* Add Term modal */}
      {showAddTerm && (
        <AddTermModal onClose={() => setShowAddTerm(false)} onSave={handleAddTerm} />
      )}

      {/* Edit Term modal — same component, term prop enables edit mode */}
      {editingTerm && (
        <AddTermModal
          term={editingTerm}
          onClose={() => setEditingTerm(null)}
          onSave={handleEditTerm}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteTerm && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteTerm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete Academic Term</h2>
            <p className="modal-desc">
              Are you sure you want to delete <strong>{confirmDeleteTerm.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmDeleteTerm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--clr-danger, #dc2626)', borderColor: 'var(--clr-danger, #dc2626)' }}
                onClick={handleConfirmDelete}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enrollment replace confirmation */}
      {confirmReplace && (
        <div className="modal-overlay" onClick={() => setConfirmReplace(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Replace Enrollment Data?</h2>
            <p className="modal-desc">
              <strong>{confirmReplace.termName}</strong> already has{' '}
              <strong>{confirmReplace.existingCount.toLocaleString()} enrollment records</strong>.
              Uploading will permanently delete and replace them with the new file.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmReplace(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--clr-danger, #dc2626)', borderColor: 'var(--clr-danger, #dc2626)' }}
                onClick={() => { setConfirmReplace(null); doEnrollmentUpload(confirmReplace.termId, confirmReplace.file); }}
              >
                <Upload size={14} /> Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Audit Logs (FR-SA5) ── */
function formatAuditDetailsWithWeeks(details, weekStartDates) {
  return details.replace(/Week\s+(\d+)[,\s]+Day\s+(\d+)/gi, (_, wk, dy) => {
    const weekIdx = parseInt(wk) - 1;
    const dayOffset = parseInt(dy) - 1;
    const startStr = weekStartDates[weekIdx];
    if (!startStr) return `Week ${wk}`;
    const [y, m, d] = startStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + dayOffset);
    const monthName = date.toLocaleString('en-US', { month: 'short' });
    return `Week ${wk}, ${monthName} ${date.getDate()}`;
  });
}

const AuditLogs = () => {
  const { auditLogs, effectiveWeekStartDates } = useCourses();
  const actionLabels = {
    booking_created: 'Booking Created',
    booking_rescheduled: 'Rescheduled',
    booking_deleted: 'Booking Deleted',
    booking_conflict: 'Booking Conflict',
    phase_activated: 'Phase Activated',
    phase_deactivated: 'Phase Deactivated',
    phase_updated: 'Phase Updated',
    level1_configured: 'Level 1 Config',
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
      <div className="card-header">
        <div className="card-title"><ClipboardList size={16} /> System Activity Log</div>
      </div>
      <div className="card-content">
        <div className="data-table-wrap"><table className="data-table">
          <thead>
            <tr><th>Action</th><th>User</th><th>Course</th><th>Details</th><th>Timestamp</th></tr>
          </thead>
          <tbody>
            {auditLogs.map(log => (
              <tr key={log.id}>
                <td><span className="badge badge-secondary">{actionLabels[log.action] || log.action}</span></td>
                <td className="text-sm">{log.user}</td>
                <td className="font-medium">{log.course}</td>
                <td className="text-sm text-muted">{formatAuditDetailsWithWeeks(log.details, effectiveWeekStartDates)}</td>
                <td className="text-xs text-muted">{new Date(log.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

/* ── Actions Dropdown ── */
const ActionsDropdown = ({ isBooked, onDelete, onBook, onReschedule }) => {
  const handleChange = (e) => {
    const val = e.target.value;
    e.target.value = '';
    if (val === 'book') onBook();
    else if (val === 'reschedule') onReschedule();
    else if (val === 'delete') onDelete();
  };

  return (
    <select
      className="form-input"
      style={{ width: 130, height: 32, fontSize: 12, cursor: 'pointer' }}
      value=""
      onChange={handleChange}
    >
      <option value="" disabled>Select action</option>
      {!isBooked && <option value="book">Book</option>}
      {isBooked && <option value="reschedule">Reschedule</option>}
      {isBooked && <option value="delete">Delete</option>}
    </select>
  );
};

/* ── Booking Admin (FR-SA6) ── */
const BookingAdmin = () => {
  const { courses, cancelBooking, formatSlotDate, refreshAuditLogs } = useCourses();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [search, levelFilter, statusFilter]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await cancelBooking(confirmDelete.courseId, confirmDelete.examType, user?.name || 'Admin', 'admin');
    toast.success(`${confirmDelete.examType} booking deleted by admin`);
    setConfirmDelete(null);
    // Pull the canonical CANCEL_BOOKING entry the backend just wrote.
    refreshAuditLogs();
  };

  const goToBooking = (courseId, examType) => {
    const qs = new URLSearchParams();
    qs.set('from', 'admin');
    if (examType) qs.set('examType', examType);
    navigate(`/booking/${courseId}?${qs.toString()}`);
  };

  const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();

  const PAGE_SIZE = 25;

  const allRows = useMemo(() => courses.map((c) => {
    const activeType = Object.keys(c.bookings || {})[0] || null;
    const booking = activeType ? c.bookings[activeType] : null;
    return { course: c, type: activeType, booking };
  }), [courses]);

  const filtered = useMemo(() => allRows.filter(({ course: c, booking: b }) => {
    if (search) {
      const q = normalize(search);
      if (!normalize(c.code).includes(q) && !normalize(c.name).includes(q)) return false;
    }
    if (levelFilter && c.level !== Number(levelFilter)) return false;
    if (statusFilter === 'booked' && !b) return false;
    if (statusFilter === 'not_booked' && b) return false;
    return true;
  }), [allRows, search, levelFilter, statusFilter]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Administrative booking create, modify, and delete actions. All actions are logged.</p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          placeholder="Search by course code or name…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 180, height: 36, fontSize: 13 }}
        />
        <select className="form-input" value={levelFilter} onChange={e => setLevelFilter(e.target.value)} style={{ width: 120, height: 36, fontSize: 13 }}>
          <option value="">All Levels</option>
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
          <option value="3">Level 3</option>
          <option value="4">Level 4</option>
        </select>
        <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 140, height: 36, fontSize: 13 }}>
          <option value="">All Statuses</option>
          <option value="booked">Booked</option>
          <option value="not_booked">Not Booked</option>
        </select>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr><th>Course</th><th>Level</th><th>Exam Type</th><th>Status</th><th>Scheduled</th><th>Proctors</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }} className="text-muted">No matching bookings found.</td></tr>
              )}
              {paginated.map(({ course: c, type, booking: b }) => {
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.code}</strong> <span className="text-xs text-muted">{c.name}</span></td>
                      <td><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                      <td><span className="badge badge-outline" style={{ fontSize: 10 }}>{type || '—'}</span></td>
                      <td>
                        <span className={`badge ${b ? 'badge-primary' : 'badge-outline'}`} style={{ fontSize: 10 }}>
                          {b ? 'Booked' : 'Not Booked'}
                        </span>
                      </td>
                      <td>{b ? `Week ${b.week}, ${formatSlotDate(b.week, b.day)}` : '—'}</td>
                      <td>{b ? `${b.maleProctors}M / ${b.femaleProctors}F` : '—'}</td>
                      <td>
                        <ActionsDropdown
                          courseId={c.id}
                          examType={type || 'Major 1'}
                          isBooked={!!b}
                          onBook={() => goToBooking(c.id, null)}
                          onReschedule={() => goToBooking(c.id, type)}
                          onDelete={() => setConfirmDelete({ courseId: c.id, examType: type, code: c.code })}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table></div>

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

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete Booking</h2>
            <p className="modal-desc">
              Are you sure you want to delete the <strong>{confirmDelete.examType}</strong> booking for <strong>{confirmDelete.code}</strong>? This action cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--clr-danger)', borderColor: 'var(--clr-danger)' }} onClick={handleDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main Admin Dashboard ── */
const AdminDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('users');

  // Persist active tab in the URL (?tab=...) so refresh/back/forward keep state.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    const valid = tabs.some(t => t.id === tab);
    if (valid && tab !== activeTab) setActiveTab(tab);
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
      case 'users':      return <UserManagement />;
      case 'settings':   return <SystemSettings />;
      case 'refdata':    return <ReferenceData />;
      case 'scheduling': return <SchedulingManagement />;
      case 'audit':      return <AuditLogs />;
      case 'bookings':   return <BookingAdmin />;
      default: return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">System Administration</h1>
          <p className="text-sm text-muted mt-1">Manage users, roles, system configuration, and audit trails</p>
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

export default AdminDashboard;
