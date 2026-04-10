import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { departments } from '../lib/mock-admin-data.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getRequiredExamTypes } from '../lib/mock-data.js';
import {
  Users, Settings, Database, ClipboardList, BookOpen, Trash2, Plus, X,
} from 'lucide-react';
import { toast } from 'sonner';
import UserManagement from '../components/admin/UserManagement.jsx';
import ReferenceData from '../components/admin/ReferenceData.jsx';
import AddTermModal from '../components/admin/AddTermModal.jsx';

const tabs = [
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'settings', label: 'System Settings', icon: Settings },
  { id: 'refdata', label: 'Reference Data', icon: Database },
  { id: 'audit', label: 'Audit Logs', icon: ClipboardList },
  { id: 'bookings', label: 'Bookings', icon: BookOpen },
];

/* (AddTermModal is now imported from src/components/admin/AddTermModal.jsx) */

/* ── System Settings (FR-SA3) ── */
const SystemSettings = () => {
  const { phases, updatePhases, addAuditLog, academicTerms: terms, setAcademicTerms: setTerms, activateTermCalendar, effectiveWeekStartDates } = useCourses();
  const { user } = useAuth();
  const [localPhases, setLocalPhases] = useState(phases.map(p => ({ ...p })));

  // Sync local state when context phases change (e.g. committee updated them)
  useEffect(() => {
    setLocalPhases(phases.map(p => ({ ...p })));
  }, [phases]);
  const [showAddTerm, setShowAddTerm] = useState(false);

  const statusLabel = (t) => {
    if (t.status === 'upcoming') return 'Upcoming';
    return t.isActive ? 'Active' : 'Past';
  };
  const statusClass = (t) => {
    if (t.status === 'upcoming') return 'badge-secondary';
    return t.isActive ? 'badge-primary' : 'badge-outline';
  };

  const handleAddTerm = (newTerm) => {
    if (newTerm.isActive) {
      setTerms(prev => [...prev.map(t => ({ ...t, isActive: false, status: t.status === 'active' ? 'past' : t.status })), newTerm]);
      // Activate the term's calendar data across the system
      if (newTerm.calendarData) {
        activateTermCalendar(newTerm.calendarData);
      }
    } else {
      setTerms(prev => [...prev, newTerm]);
    }
    setShowAddTerm(false);
    addAuditLog({ action: 'term_created', user: user?.name || 'Admin', details: `Created term ${newTerm.name} (${newTerm.status})` });
    toast.success('Academic term added successfully');
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
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr><th>Term</th><th>Start</th><th>End</th><th>Status</th></tr>
            </thead>
            <tbody>
              {terms.map(t => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name}</td>
                  <td>{t.startDate}</td>
                  <td>{t.endDate}</td>
                  <td><span className={`badge ${statusClass(t)}`} style={{ fontSize: 10 }}>{statusLabel(t)}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title"><Settings size={16} /> Booking Phase Windows</div>
        </div>
        <div className="card-content">
          {localPhases.map((phase, idx) => (
            <div key={phase.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: idx < localPhases.length - 1 ? '1px solid var(--clr-border)' : 'none' }}>
              <span className="text-sm font-medium">{phase.name}</span>
              <input className="form-input" type="date" value={phase.startDate} onChange={e => { const u = [...localPhases]; u[idx] = { ...u[idx], startDate: e.target.value }; setLocalPhases(u); }} style={{ height: 32, fontSize: 13 }} />
              <input className="form-input" type="date" value={phase.endDate} onChange={e => { const u = [...localPhases]; u[idx] = { ...u[idx], endDate: e.target.value }; setLocalPhases(u); }} style={{ height: 32, fontSize: 13 }} />
            </div>
          ))}
          <button className="btn btn-primary btn-sm mt-4" onClick={() => {
            localPhases.forEach((lp, idx) => {
              const old = phases[idx];
              if (!old) return;
              if (lp.isActive !== old.isActive) {
                addAuditLog({ action: lp.isActive ? 'phase_activated' : 'phase_deactivated', user: user?.name || 'Admin', details: `${lp.name} ${lp.isActive ? 'activated' : 'deactivated'}` });
              } else if (lp.startDate !== old.startDate || lp.endDate !== old.endDate) {
                addAuditLog({ action: 'phase_updated', user: user?.name || 'Admin', details: `${lp.name} dates updated` });
              }
            });
            updatePhases(localPhases);
            toast.success('Phase configuration saved');
          }}>Save Changes</button>
        </div>
      </div>

      {showAddTerm && <AddTermModal onClose={() => setShowAddTerm(false)} onSave={handleAddTerm} />}
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
    phase_activated: 'Phase Activated',
    phase_deactivated: 'Phase Deactivated',
    phase_updated: 'Phase Updated',
    level1_configured: 'Level 1 Config',
    user_role_changed: 'Role Changed',
    user_deactivated: 'User Deactivated',
    user_activated: 'User Activated',
    user_deleted: 'User Deleted',
    user_created: 'User Created',
    term_created: 'Term Created',
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
  const { courses, cancelBooking, formatSlotDate } = useCourses();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const handleDelete = () => {
    if (!confirmDelete) return;
    cancelBooking(confirmDelete.courseId, confirmDelete.examType, user?.name || 'Admin');
    toast.success(`${confirmDelete.examType} booking deleted by admin`);
    setConfirmDelete(null);
  };

  const goToBooking = (courseId, examType) => {
    navigate(`/booking/${courseId}?examType=${encodeURIComponent(examType)}&from=admin`);
  };

  const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();

  // Build flat rows then filter
  const allRows = courses.flatMap(c => {
    const types = getRequiredExamTypes(c);
    return types.map(type => ({ course: c, type, booking: c.bookings[type] || null }));
  });

  const filtered = allRows.filter(({ course: c, booking: b }) => {
    if (search) {
      const q = normalize(search);
      if (!normalize(c.code).includes(q) && !normalize(c.name).includes(q)) return false;
    }
    if (levelFilter && c.level !== Number(levelFilter)) return false;
    if (statusFilter === 'booked' && !b) return false;
    if (statusFilter === 'not_booked' && b) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Administrative booking create, modify, and delete actions. All actions are logged.</p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          placeholder="Search by course code or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
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
              {filtered.map(({ course: c, type, booking: b }) => {
                  return (
                    <tr key={`${c.id}-${type}`}>
                      <td><strong>{c.code}</strong> <span className="text-xs text-muted">{c.name}</span></td>
                      <td><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                      <td><span className="badge badge-outline" style={{ fontSize: 10 }}>{type}</span></td>
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
                          examType={type}
                          isBooked={!!b}
                          onBook={() => goToBooking(c.id, type)}
                          onReschedule={() => goToBooking(c.id, type)}
                          onDelete={() => setConfirmDelete({ courseId: c.id, examType: type, code: c.code })}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table></div>
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
  const [activeTab, setActiveTab] = useState('users');

  const renderTab = () => {
    switch (activeTab) {
      case 'users': return <UserManagement />;
      case 'settings': return <SystemSettings />;
      case 'refdata': return <ReferenceData />;
      case 'audit': return <AuditLogs />;
      case 'bookings': return <BookingAdmin />;
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
                onClick={() => setActiveTab(tab.id)}
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
