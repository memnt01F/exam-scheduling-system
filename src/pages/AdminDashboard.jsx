import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Users, Settings, Database, ClipboardList, BookOpen, Trash2, Plus, X, Pencil, Upload, FileSpreadsheet, RefreshCw, Calendar, UserCheck, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import UserManagement from '../components/admin/UserManagement.jsx';
import ReferenceData from '../components/admin/ReferenceData.jsx';
import SchedulingManagement from '../components/admin/SchedulingManagement.jsx';
import AddTermModal from '../components/admin/AddTermModal.jsx';
import ProctorSummary from '../components/admin/ProctorSummary.jsx';
import { getEnrollmentStats, uploadEnrollments, rebuildConflicts, getBookings, deleteBooking, getExamGroups, createExamGroup, updateExamGroup, deleteExamGroup } from '../services/api.js';

const tabs = [
  { id: 'users',      label: 'User Management',      icon: Users },
  { id: 'settings',   label: 'System Settings',       icon: Settings },
  { id: 'refdata',    label: 'Reference Data',        icon: Database },
  { id: 'scheduling', label: 'Scheduling Management', icon: Calendar },
  { id: 'bookings',   label: 'Bookings',              icon: BookOpen },
  { id: 'proctors',   label: 'Proctor Summary',       icon: UserCheck },
  { id: 'audit',      label: 'Audit Logs',            icon: ClipboardList },
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
    const invalid = local.find(p => p.startDate && p.endDate && p.startDate > p.endDate);
    if (invalid) {
      toast.error(`${invalid.name}: start date cannot be after end date`);
      return;
    }
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

  // Exam groups state
  const [examGroups, setExamGroups]               = useState([]);
  const [examGroupTermId, setExamGroupTermId]      = useState(() => localStorage.getItem('examGroupTermId') || '');
  const [showGroupModal, setShowGroupModal]        = useState(false);
  const [editingGroup, setEditingGroup]            = useState(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null);

  const setExamGroupTermIdPersisted = (id) => {
    localStorage.setItem('examGroupTermId', id);
    setExamGroupTermId(id);
  };

  useEffect(() => {
    getEnrollmentStats()
      .then(data => setEnrollmentStats(data.stats || []))
      .catch(() => {});
  }, []);

  // Set default exam group term to the last term, but only if nothing is stored
  useEffect(() => {
    if (!examGroupTermId && terms.length > 0) {
      setExamGroupTermIdPersisted(terms[terms.length - 1]._serverId || terms[terms.length - 1].id);
    }
  }, [terms]);

  // Reload groups when term changes
  useEffect(() => {
    if (!examGroupTermId) return;
    getExamGroups(examGroupTermId)
      .then(data => setExamGroups(Array.isArray(data) ? data : []))
      .catch(() => setExamGroups([]));
  }, [examGroupTermId]);

  const handleEnrollmentUploadForTerm = (termId, termName, file) => {
    const existing = enrollmentStats.find(s => String(s.termId) === String(termId));
    if (existing && existing.count > 0) {
      setConfirmReplace({ termId, termName, existingCount: existing.count, file });
      return;
    }
    doEnrollmentUpload(termId, file);
  };

  /**
   * Upload replaces every enrollment row for the term, which also wipes the
   * copied rosters of any lab course. The backend re-copies them from their
   * parent and rebuilds the conflict cache as part of the same request; this
   * reports both, because a lab left with no students is silently dropped from
   * the generated schedule with only a solver warning to show for it.
   */
  const doEnrollmentUpload = async (termId, file) => {
    setUploading(true);
    try {
      const result = await uploadEnrollments(termId, file, user?.name || 'admin');
      const skippedNote = result.skipped > 0 ? ` (${result.skipped.toLocaleString()} rows skipped — missing ID or course code)` : '';
      toast.success(`${result.inserted.toLocaleString()} enrollments uploaded for ${result.termName}${skippedNote}`);

      // Lab enrollment sync
      const labSync = Array.isArray(result.labSync) ? result.labSync : [];
      const labsSkipped = labSync.filter(l => l.skipped);
      if (labSync.length > 0) {
        const copied = labSync.reduce((sum, l) => sum + (l.copied || 0), 0);
        if (labsSkipped.length > 0) {
          toast.warning(`${labsSkipped.length} lab course(s) got no enrollment data`, {
            description: labsSkipped.map(l => `${l.labCode}: ${l.skipped}`).join(' · '),
          });
        }
        if (copied > 0) {
          toast.success(`${copied.toLocaleString()} lab enrollment(s) synced across ${labSync.length - labsSkipped.length} lab course(s)`);
        }
      }
      if (result.labSyncError) {
        toast.error(`Lab enrollment sync failed: ${result.labSyncError}`);
      }

      // The backend rebuilds the conflict cache inline. Retry once from here if
      // that failed — the scheduler on Render can take ~30s to wake from idle.
      if (result.conflictsRebuilt && !result.conflictsRebuilt.ok) {
        try {
          await rebuildConflicts(termId);
        } catch (err) {
          toast.warning('Enrollments saved, but the conflict cache could not be rebuilt — day scores may be stale.', {
            description: err.data?.message || result.conflictsRebuilt.message || err.message,
          });
        }
      }

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

      {/* Exam Groups */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
          <div className="card-title"><Database size={16} /> Exam Groups</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="form-input"
              style={{ width: 160, height: 32, fontSize: 13 }}
              value={examGroupTermId}
              onChange={e => setExamGroupTermIdPersisted(e.target.value)}
            >
              {terms.map(t => (
                <option key={t._serverId || t.id} value={t._serverId || t.id}>{t.name}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditingGroup(null); setShowGroupModal(true); }}>
              <Plus size={14} /> Add Group
            </button>
          </div>
        </div>
        <div className="card-content">
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Courses in the same exam group are scheduled on one exclusive day. The scheduler reads this directly.
          </p>
          {examGroups.length === 0 ? (
            <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '16px 0' }}>No exam groups for this term.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Group Name</th><th>Courses</th><th style={{ width: 80 }}></th></tr>
                </thead>
                <tbody>
                  {examGroups.map(g => (
                    <tr key={g._id}>
                      <td className="font-medium">{g.name}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {g.courseCodes.map(c => (
                            <span key={c} className="badge badge-secondary" style={{ fontSize: 11 }}>{c}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => { setEditingGroup(g); setShowGroupModal(true); }}>
                            <Pencil size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => setConfirmDeleteGroup(g)}>
                            <Trash2 size={14} color="var(--clr-danger)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Exam Group modal (add / edit) */}
      {showGroupModal && (
        <ExamGroupModal
          group={editingGroup}
          termId={examGroupTermId}
          onClose={() => setShowGroupModal(false)}
          onSave={async (payload) => {
            try {
              if (editingGroup) {
                await updateExamGroup(editingGroup._id, payload);
                toast.success('Exam group updated');
              } else {
                await createExamGroup({ ...payload, termId: examGroupTermId });
                toast.success('Exam group created');
              }
              const data = await getExamGroups(examGroupTermId);
              setExamGroups(Array.isArray(data) ? data : []);
              setShowGroupModal(false);
            } catch (err) {
              toast.error(err.message || 'Failed to save exam group');
            }
          }}
        />
      )}

      {/* Exam Group delete confirmation */}
      {confirmDeleteGroup && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteGroup(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete Exam Group</h2>
            <p className="modal-desc">
              Delete <strong>{confirmDeleteGroup.name}</strong>? This cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setConfirmDeleteGroup(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--clr-danger)', borderColor: 'var(--clr-danger)' }}
                onClick={async () => {
                  try {
                    await deleteExamGroup(confirmDeleteGroup._id);
                    toast.success('Exam group deleted');
                    const data = await getExamGroups(examGroupTermId);
                    setExamGroups(Array.isArray(data) ? data : []);
                  } catch (err) {
                    toast.error(err.message || 'Failed to delete');
                  } finally {
                    setConfirmDeleteGroup(null);
                  }
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

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

/* ── Exam Group Modal ── */
const ExamGroupModal = ({ group, termId, onClose, onSave }) => {
  const { courses } = useCourses();
  const [name, setName] = useState(group?.name || '');
  const [codes, setCodes] = useState(group?.courseCodes || []);
  const [courseSearch, setCourseSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleCode = (code) => {
    setCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const filteredCourses = courses.filter(c => {
    const q = courseSearch.replace(/\s+/g, '').toLowerCase();
    return !q || c.code.replace(/\s+/g, '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q);
  });

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Group name is required'); return; }
    if (codes.length < 2) { toast.error('At least 2 course codes are required'); return; }
    setSaving(true);
    await onSave({ name: name.trim(), courseCodes: codes });
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 480, maxWidth: '95vw' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><Database size={16} /> {group ? 'Edit Exam Group' : 'Add Exam Group'}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="card-content space-y-3">
          <div>
            <label className="text-sm font-medium">Group Name</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. MATHGroup"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Courses</label>
            <input
              className="form-input"
              placeholder="Search courses..."
              value={courseSearch}
              onChange={e => setCourseSearch(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <div style={{ border: '1px solid var(--clr-border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', padding: 4 }}>
              {filteredCourses.length === 0 && (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--clr-muted)', fontSize: 13 }}>No courses found</div>
              )}
              {filteredCourses.map(c => {
                const selected = codes.includes(c.code);
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleCode(c.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      borderRadius: 6, cursor: 'pointer', fontSize: 13,
                      background: selected ? 'var(--clr-primary-light, hsl(215 80% 95%))' : 'transparent',
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: selected ? 'none' : '1.5px solid var(--clr-border)',
                      background: selected ? 'var(--clr-primary)' : 'transparent',
                      color: '#fff', flexShrink: 0,
                    }}>
                      {selected && <Check size={12} />}
                    </span>
                    <span className="font-medium">{c.code}</span>
                    <span style={{ color: 'var(--clr-muted)' }}>— {c.name}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 4 }}>
              {codes.length === 0
                ? 'Select at least 2 courses.'
                : <>{codes.length} course{codes.length !== 1 ? 's' : ''} selected{codes.length < 2 && <span style={{ color: 'var(--clr-danger, #dc2626)' }}> — minimum 2 required</span>}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : group ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
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
    lab_course_created: 'Lab Course Created',
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
  const { courses, academicTerms, refreshAuditLogs } = useCourses();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTermId, setSelectedTermId] = useState(() => localStorage.getItem('admin_bookings_termId') || '');
  const [termBookings, setTermBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const handleTermChange = (id) => {
    setSelectedTermId(id);
    localStorage.setItem('admin_bookings_termId', id);
  };

  useEffect(() => {
    if (!academicTerms.length || selectedTermId) return;
    const active = academicTerms.find(t => t.isActive) || academicTerms[0];
    if (active) {
      const id = active._serverId || active.id;
      setSelectedTermId(id);
      localStorage.setItem('admin_bookings_termId', id);
    }
  }, [academicTerms, selectedTermId]);

  useEffect(() => {
    if (!selectedTermId) return;
    setLoadingBookings(true);
    getBookings({ termId: selectedTermId })
      .then(data => setTermBookings(Array.isArray(data) ? data : []))
      .catch(() => setTermBookings([]))
      .finally(() => setLoadingBookings(false));
  }, [selectedTermId]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [search, levelFilter, statusFilter, selectedTermId]);

  const refreshTermBookings = () => {
    if (!selectedTermId) return;
    getBookings({ termId: selectedTermId })
      .then(data => setTermBookings(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await deleteBooking(confirmDelete.bookingId, { updatedBy: user?.name || 'Admin' });
    toast.success(`${confirmDelete.examType} booking deleted by admin`);
    setConfirmDelete(null);
    refreshAuditLogs();
    refreshTermBookings();
  };

  const goToBooking = (course, booking, presetType = null) => {
    const qs = new URLSearchParams();
    qs.set('from', 'admin');
    qs.set('phase', '2');
    if (selectedTermId) qs.set('termId', selectedTermId);
    if (booking) {
      qs.set('examType', booking.examType);
      qs.set('bookingId', booking._id);
    } else if (presetType) {
      qs.set('examType', presetType);
    }
    navigate(`/booking/${course.id}?${qs.toString()}`);
  };

  const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();

  const PAGE_SIZE = 25;

  const PHASE2_EXAM_TYPES = ['Major 1', 'Major 2', 'Mid'];

  const allRows = useMemo(() => {
    const norm = s => String(s || '').replace(/\s+/g, '').toUpperCase();
    const bookingMap = {};
    for (const b of termBookings) {
      const code = norm(b.courseCode);
      if (!bookingMap[code]) bookingMap[code] = {};
      bookingMap[code][b.examType || 'Major 1'] = b;
    }
    return courses.map(c => ({ course: c, bookingsByType: bookingMap[norm(c.code)] || {} }));
  }, [courses, termBookings]);

  const filtered = useMemo(() => allRows.filter(({ course: c, bookingsByType }) => {
    if (search) {
      const q = normalize(search);
      if (!normalize(c.code).includes(q) && !normalize(c.name || '').includes(q)) return false;
    }
    if (levelFilter && c.level !== Number(levelFilter)) return false;
    const hasActive = PHASE2_EXAM_TYPES.some(t => bookingsByType[t] && bookingsByType[t].status !== 'cancelled');
    if (statusFilter === 'booked' && !hasActive) return false;
    if (statusFilter === 'not_booked' && hasActive) return false;
    return true;
  }), [allRows, search, levelFilter, statusFilter]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const handleExport = () => {
    const termName = academicTerms.find(t => (t._serverId || t.id) === selectedTermId)?.name || selectedTermId || 'all';
    const header = ['Course Code', 'Level', 'Exam Type', 'Exam Date', 'Room', 'Male Proctors', 'Female Proctors', 'Status', 'Booked By'];
    const rows = [];
    for (const { course: c, bookingsByType } of filtered) {
      const active = PHASE2_EXAM_TYPES
        .map(t => ({ type: t, b: bookingsByType[t] }))
        .filter(({ b }) => b && b.status !== 'cancelled');
      if (active.length === 0) {
        rows.push([c.code, c.level, '', '', '', '', '', 'Not Booked', '']);
      } else {
        for (const { type, b } of active) {
          rows.push([
            c.code, c.level, type,
            b.examDate ? new Date(b.examDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
            b.room || '',
            b.maleProctors ?? 0,
            b.femaleProctors ?? 0,
            b.status,
            b.createdBy || '',
          ]);
        }
      }
    }
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_term_${termName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Administrative booking create, modify, and delete actions. All actions are logged.</p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-input" value={selectedTermId} onChange={e => handleTermChange(e.target.value)} style={{ width: 180, height: 36, fontSize: 13 }}>
          {!academicTerms.length && <option value="">Loading terms…</option>}
          {academicTerms.map(t => <option key={t._serverId || t.id} value={t._serverId || t.id}>{t.name}</option>)}
        </select>
        <input
          className="form-input"
          placeholder="Search by course code…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          style={{ flex: '1 1 180px', minWidth: 160, height: 36, fontSize: 13 }}
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
        <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, whiteSpace: 'nowrap' }} onClick={handleExport}>
          <FileSpreadsheet size={14} /> Export CSV
        </button>
      </div>
      {loadingBookings && <p className="text-sm text-muted">Loading bookings…</p>}

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr><th>Course</th><th>Level</th><th>Status</th><th>Scheduled</th><th>Proctors</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }} className="text-muted">No matching bookings found.</td></tr>
              )}
              {paginated.map(({ course: c, bookingsByType }) => {
                const isActive = t => bookingsByType[t] && bookingsByType[t].status !== 'cancelled';
                const majorActive = ['Major 1', 'Major 2'].some(isActive);
                const midActive = isActive('Mid');
                const manageableTypes = PHASE2_EXAM_TYPES.filter(isActive);
                const visibleTypes = PHASE2_EXAM_TYPES.filter(t => {
                  if (t === 'Mid' && majorActive) return false;
                  if ((t === 'Major 1' || t === 'Major 2') && midActive) return false;
                  return true;
                });
                const bookableTypes = visibleTypes.filter(t => !isActive(t));
                const fmtDate = d => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                return (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong></td>
                    <td><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                    <td>
                      {manageableTypes.length === 0 ? (
                        <span style={{ color: 'var(--clr-muted)' }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {manageableTypes.map(type => {
                            const label = type === 'Major 1' ? 'M1' : type === 'Major 2' ? 'M2' : 'Mid';
                            return <span key={type} className="badge badge-primary" style={{ fontSize: 10 }}>{label} ✓</span>;
                          })}
                        </div>
                      )}
                    </td>
                    <td className="text-sm">
                      {manageableTypes.length === 0 ? '—' : midActive ? (
                        fmtDate(bookingsByType['Mid'].examDate)
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {['Major 1', 'Major 2'].filter(isActive).map(type => (
                            <span key={type} style={{ fontSize: 11 }}>
                              {type === 'Major 1' ? 'M1' : 'M2'}: {fmtDate(bookingsByType[type].examDate)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-sm">
                      {manageableTypes.length === 0 ? '—' : midActive ? (
                        <span>{bookingsByType['Mid'].maleProctors ?? 0}M / {bookingsByType['Mid'].femaleProctors ?? 0}F</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {['Major 1', 'Major 2'].filter(isActive).map(type => (
                            <span key={type} style={{ fontSize: 11 }}>
                              {type === 'Major 1' ? 'M1' : 'M2'}: {bookingsByType[type].maleProctors ?? 0}M / {bookingsByType[type].femaleProctors ?? 0}F
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <select className="form-input" style={{ width: 160, fontSize: 12 }} value="" onChange={e => {
                        const val = e.target.value;
                        if (val === 'book') goToBooking(c, null, bookableTypes.length === 1 ? bookableTypes[0] : null);
                        else if (val.startsWith('reschedule|')) goToBooking(c, bookingsByType[val.slice(11)]);
                        else if (val.startsWith('delete|')) setConfirmDelete({ bookingId: bookingsByType[val.slice(7)]?._id, examType: val.slice(7), code: c.code });
                        e.target.value = '';
                      }}>
                        <option value="" disabled>Select action</option>
                        {bookableTypes.length > 0 && <option value="book">Book</option>}
                        {manageableTypes.map(type => (
                          <option key={`reschedule|${type}`} value={`reschedule|${type}`}>Reschedule {type}</option>
                        ))}
                        {manageableTypes.map(type => (
                          <option key={`delete|${type}`} value={`delete|${type}`}>Delete {type}</option>
                        ))}
                      </select>
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
      case 'proctors':   return <ProctorSummary />;
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
