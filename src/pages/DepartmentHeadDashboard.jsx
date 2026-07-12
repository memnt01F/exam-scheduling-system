import { useState, useMemo, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout.jsx';
import SchedulingManagement from '../components/admin/SchedulingManagement.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBookings, createBooking, updateBooking, deleteBooking } from '../services/api.js';
import { BookOpen, BarChart2, Search, AlertTriangle, Users, CalendarDays, Plus, Pencil, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const EXAM_TYPES = ['Major 1', 'Major 2', 'Major 3', 'Mid'];

const tabs = [
  { id: 'assignments', label: 'Course Assignments', icon: BookOpen },
  { id: 'users',       label: 'User Management',    icon: Users },
  { id: 'preferences', label: 'Schedule Management', icon: BarChart2 },
  { id: 'bookings',    label: 'Bookings',            icon: CalendarDays },
];

/* ── Assignments tab ── */
const PAGE_SIZE = 25;

const AssignmentsTab = ({ deptCourses, coordinators, assignments, setAssignments, saving, onSave }) => {
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const depts = useMemo(() => [...new Set(deptCourses.map(c => c.department))].sort(), [deptCourses]);

  const filtered = useMemo(() => deptCourses.filter(c => {
    const matchDept = !deptFilter || c.department === deptFilter;
    const q = search.toLowerCase();
    const matchSearch = !search || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    return matchDept && matchSearch;
  }), [deptCourses, deptFilter, search]);

  useEffect(() => { setPage(1); }, [search, deptFilter]);

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const unassigned = deptCourses.filter(c => !assignments[c.code]).length;

  return (
    <div className="space-y-4">
      {unassigned > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d' }}>
          <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>
            {unassigned} course{unassigned !== 1 ? 's have' : ' has'} no coordinator assigned.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--clr-muted)' }} />
          <input className="form-input" placeholder="Search courses…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        {depts.length > 1 && (
          <select className="form-input" style={{ width: 'auto' }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Assignments'}
        </button>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Name</th>
                  <th>Level</th>
                  <th>Department</th>
                  <th>Coordinator</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(c => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.code}</td>
                    <td className="text-sm">{c.name}</td>
                    <td className="text-sm">{c.level}</td>
                    <td className="text-sm">{c.department}</td>
                    <td>
                      <select
                        className="form-input"
                        style={{ minWidth: 180 }}
                        value={assignments[c.code] || ''}
                        onChange={e => setAssignments(prev => ({ ...prev, [c.code]: e.target.value }))}
                      >
                        <option value="">— Unassigned —</option>
                        {coordinators.map(coord => (
                          <option key={coord.id} value={coord.id}>{coord.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>
                      No courses found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
    </div>
  );
};

/* ── Users tab ── */
const BLANK_USER = { name: '', email: '', password: '', department: '', isActive: true };

const UsersTab = ({ managedDepts, deptUsers, addUser, updateUser }) => {
  const { user: authUser } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(BLANK_USER);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = () => {
    setForm({ ...BLANK_USER, department: managedDepts[0] || '' });
    setModal({ mode: 'add' });
  };

  const openEdit = (u) => {
    const dept = managedDepts.includes(u.department) ? u.department : (managedDepts[0] || '');
    setForm({ name: u.name, email: u.email, password: '', department: dept, isActive: u.isActive !== false });
    setModal({ mode: 'edit', data: u });
  };

  const closeModal = () => { setModal(null); setForm(BLANK_USER); };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.email.trim()) return toast.error('Email is required');
    if (!form.department) return toast.error('Department is required');
    if (modal.mode === 'add' && !form.password.trim()) return toast.error('Password is required for new users');
    setSaving(true);
    if (modal.mode === 'add') {
      const res = await addUser(
        { name: form.name, email: form.email, password: form.password, role: 'coordinator', department: form.department, isActive: form.isActive, assignedCourses: [], managedDepartments: [] },
        authUser?.name || 'Dept Head'
      );
      if (res?.success === false) { setSaving(false); return; }
      toast.success('User added');
    } else {
      const patch = { name: form.name, email: form.email, department: form.department, isActive: form.isActive };
      if (form.password.trim()) patch.password = form.password;
      const res = await updateUser(modal.data.id, patch, authUser?.name || 'Dept Head');
      if (res?.success === false) { setSaving(false); return; }
      toast.success('User updated');
    }
    setSaving(false);
    closeModal();
  };

  const filtered = useMemo(() =>
    deptUsers.filter(u => {
      if (deptFilter && u.department !== deptFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }),
    [deptUsers, search, deptFilter]
  );

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--clr-muted)' }} />
          <input className="form-input" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        {managedDepts.length > 1 && (
          <select className="form-input" style={{ width: 'auto' }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {managedDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={openAdd}>
          <Plus size={14} /> Add User
        </button>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Courses</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}</td>
                    <td className="text-sm">{u.email}</td>
                    <td className="text-sm">{u.department || '—'}</td>
                    <td className="text-sm">{(u.assignedCourses || []).length} course{(u.assignedCourses || []).length !== 1 ? 's' : ''}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => openEdit(u)}>
                        <Pencil size={12} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>
                      No coordinators found in your department{managedDepts.length !== 1 ? 's' : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={closeModal}>
          <div className="card" style={{ width: 480, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title"><Plus size={16} /> {modal.mode === 'add' ? 'Add New User' : 'Edit User'}</div>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}><X size={16} /></button>
            </div>
            <div className="card-content space-y-3" style={{ overflowY: 'auto' }}>
              <div>
                <label className="text-sm font-medium">Name</label>
                <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@kfupm.edu.sa" />
              </div>
              <div>
                <label className="text-sm font-medium">Role</label>
                <select className="form-input" disabled>
                  <option>Coordinator</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Department</label>
                <select className="form-input" value={form.department} onChange={e => set('department', e.target.value)}>
                  {managedDepts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <select className="form-input" value={form.isActive ? 'active' : 'inactive'} onChange={e => set('isActive', e.target.value === 'active')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{modal.mode === 'add' ? 'Password' : 'New Password (leave blank to keep)'}</label>
                <input className="form-input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--clr-border)' }}>
              <button className="btn btn-outline btn-sm" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : modal.mode === 'add' ? 'Add User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


/* ── Bookings tab ── */
const BLANK_BOOKING = { courseCode: '', examType: 'Major 1', examDate: '', room: '', maleProctors: 0, femaleProctors: 0 };

const BookingsTab = ({ deptCourses, authUserName }) => {
  const [bookings, setBookings]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null); // null | { mode: 'add' | 'edit', data? }
  const [form, setForm]             = useState(BLANK_BOOKING);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const depts = useMemo(() => [...new Set(deptCourses.map(c => c.department))].sort(), [deptCourses]);
  const courseByCode = useMemo(() => Object.fromEntries(deptCourses.map(c => [c.code, c])), [deptCourses]);

  const deptCodes = useMemo(() => new Set(deptCourses.map(c => c.code)), [deptCourses]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getBookings();
      const deptBookings = (Array.isArray(all) ? all : []).filter(
        b => b.phaseNumber === null || b.phaseNumber === undefined
      ).filter(b => deptCodes.has(b.courseCode));
      setBookings(deptBookings);
    } catch {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [deptCodes]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const openAdd = () => {
    setForm({ ...BLANK_BOOKING, courseCode: deptCourses[0]?.code || '' });
    setModal({ mode: 'add' });
  };

  const openEdit = (b) => {
    const dateStr = b.examDate ? new Date(b.examDate).toISOString().slice(0, 10) : '';
    setForm({ courseCode: b.courseCode, examType: b.examType, examDate: dateStr, room: b.room || '', maleProctors: b.maleProctors || 0, femaleProctors: b.femaleProctors || 0 });
    setModal({ mode: 'edit', data: b });
  };

  const closeModal = () => { setModal(null); setForm(BLANK_BOOKING); };

  const handleSave = async () => {
    if (!form.courseCode) return toast.error('Select a course');
    if (!form.examDate)   return toast.error('Select an exam date');
    setSaving(true);
    try {
      const payload = {
        courseCode:     form.courseCode,
        examType:       form.examType,
        examDate:       form.examDate,
        room:           form.room,
        maleProctors:   Number(form.maleProctors) || 0,
        femaleProctors: Number(form.femaleProctors) || 0,
        status:         'pending',
        phaseNumber:    null,
        createdBy:      authUserName,
        updatedBy:      authUserName,
      };
      if (modal.mode === 'add') {
        await createBooking(payload);
        toast.success('Booking created');
      } else {
        await updateBooking(modal.data._id || modal.data.id, { ...payload, updatedBy: authUserName });
        toast.success('Booking updated');
      }
      await fetchBookings();
      closeModal();
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (b) => {
    if (!confirm(`Cancel booking for ${b.courseCode} — ${b.examType}?`)) return;
    try {
      await deleteBooking(b._id || b.id, { updatedBy: authUserName });
      toast.success('Booking cancelled');
      await fetchBookings();
    } catch {
      toast.error('Failed to cancel booking');
    }
  };

  const filtered = useMemo(() =>
    bookings.filter(b => {
      if (deptFilter && courseByCode[b.courseCode]?.department !== deptFilter) return false;
      if (!search) return true;
      return b.courseCode.toLowerCase().includes(search.toLowerCase());
    }),
    [bookings, search, deptFilter, courseByCode]
  );

  const statusBadge = (s) => {
    const map = { pending: '#e68a00', approved: 'var(--clr-primary)', rejected: '#dc2626', cancelled: 'var(--clr-muted)' };
    return <span style={{ fontSize: 11, fontWeight: 600, color: map[s] || 'var(--clr-muted)', textTransform: 'capitalize' }}>{s}</span>;
  };

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--clr-muted)' }} />
          <input className="form-input" placeholder="Search by course…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        {depts.length > 1 && (
          <select className="form-input" style={{ width: 'auto' }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={openAdd}>
          <Plus size={14} /> Add Booking
        </button>
      </div>

      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--clr-muted)' }}>Loading bookings…</div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Exam Type</th>
                    <th>Date</th>
                    <th>Room</th>
                    <th>Proctors (M/F)</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b._id || b.id}>
                      <td className="font-medium">{b.courseCode}</td>
                      <td className="text-sm">{b.examType}</td>
                      <td className="text-sm">{b.examDate ? new Date(b.examDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                      <td className="text-sm">{b.room || '—'}</td>
                      <td className="text-sm">{b.maleProctors ?? 0} / {b.femaleProctors ?? 0}</td>
                      <td>{statusBadge(b.status)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {b.status !== 'cancelled' && (
                            <>
                              <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => openEdit(b)}>
                                <Pencil size={12} /> Edit
                              </button>
                              <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', borderColor: '#dc2626' }} onClick={() => handleCancel(b)}>
                                <Trash2 size={12} /> Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>
                        No Phase 2 bookings found for your department{deptCourses.length !== 1 ? 's' : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box" style={{ maxWidth: 460, background: 'var(--clr-card)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{modal.mode === 'add' ? 'Add Booking' : 'Edit Booking'}</h2>
              <button className="modal-close" onClick={closeModal}><X size={16} /></button>
            </div>
            <div className="modal-body space-y-3">
              <div>
                <label className="form-label">Course</label>
                <select className="form-input" value={form.courseCode} onChange={e => setForm(p => ({ ...p, courseCode: e.target.value }))} disabled={modal.mode === 'edit'}>
                  <option value="">Select course…</option>
                  {deptCourses.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Exam Type</label>
                <select className="form-input" value={form.examType} onChange={e => setForm(p => ({ ...p, examType: e.target.value }))}>
                  {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Exam Date</label>
                <input className="form-input" type="date" value={form.examDate} onChange={e => setForm(p => ({ ...p, examDate: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Room</label>
                <input className="form-input" value={form.room} onChange={e => setForm(p => ({ ...p, room: e.target.value }))} placeholder="e.g. Building 22 - 101" />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Male Proctors</label>
                  <input className="form-input" type="number" min={0} value={form.maleProctors} onChange={e => setForm(p => ({ ...p, maleProctors: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Female Proctors</label>
                  <input className="form-input" type="number" min={0} value={form.femaleProctors} onChange={e => setForm(p => ({ ...p, femaleProctors: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-sm" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : modal.mode === 'add' ? 'Create Booking' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main Dashboard ── */
const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { courses, users, updateUser: updateUserCtx, addUser: addUserCtx } = useCourses();

  const liveUser    = users.find(u => u.email === user?.email);
  const managedDepts = liveUser?.managedDepartments || [];
  const [activeTab, setActiveTab] = useState('assignments');

  // Only coordinators from managed departments
  const coordinators = useMemo(
    () => users.filter(u => u.role === 'coordinator' && managedDepts.includes(u.department)),
    [users, managedDepts]
  );

  // All users (coordinators) in managed departments for Users tab
  const deptUsers = useMemo(
    () => users.filter(u => u.role === 'coordinator' && managedDepts.includes(u.department)),
    [users, managedDepts]
  );

  const deptCourses = useMemo(
    () => courses
      .filter(c => managedDepts.includes(c.department))
      .sort((a, b) => a.code.localeCompare(b.code)),
    [courses, managedDepts]
  );

  const [assignments, setAssignments] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = {};
    deptCourses.forEach(c => {
      const coord = coordinators.find(u => (u.assignedCourses || []).includes(c.code));
      init[c.code] = coord?.id || '';
    });
    setAssignments(init);
  }, [deptCourses, coordinators]);

  const handleSave = async () => {
    setSaving(true);

    const finalSets = {};
    coordinators.forEach(c => { finalSets[c.id] = new Set(c.assignedCourses || []); });

    deptCourses.forEach(({ code }) => {
      const newCoordId = assignments[code] || '';
      const oldCoord = coordinators.find(c => (c.assignedCourses || []).includes(code));

      if (oldCoord && oldCoord.id !== newCoordId) {
        finalSets[oldCoord.id]?.delete(code);
      }
      if (newCoordId) {
        if (!finalSets[newCoordId]) finalSets[newCoordId] = new Set();
        finalSets[newCoordId].add(code);
      }
    });

    for (const coord of coordinators) {
      const newArr = [...(finalSets[coord.id] || new Set())];
      const oldSorted = [...new Set(coord.assignedCourses || [])].sort().join(',');
      const newSorted = newArr.slice().sort().join(',');
      if (oldSorted !== newSorted) {
        await updateUserCtx(coord.id, { assignedCourses: newArr }, user?.name || 'Dept Head');
      }
    }

    setSaving(false);
    toast.success('Assignments saved successfully');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Department Head</h1>
          <p className="text-sm text-muted mt-1">
            {managedDepts.length
              ? `Managing: ${managedDepts.join(', ')}`
              : 'No departments assigned — contact admin'}
          </p>
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

        {activeTab === 'assignments' && (
          <AssignmentsTab
            deptCourses={deptCourses}
            coordinators={coordinators}
            assignments={assignments}
            setAssignments={setAssignments}
            saving={saving}
            onSave={handleSave}
          />
        )}

        {activeTab === 'users' && (
          <UsersTab
            managedDepts={managedDepts}
            deptUsers={deptUsers}
            addUser={addUserCtx}
            updateUser={updateUserCtx}
          />
        )}

        {activeTab === 'preferences' && (
          <SchedulingManagement restrictedDepts={managedDepts} />
        )}

        {activeTab === 'bookings' && (
          <BookingsTab
            deptCourses={deptCourses}
            authUserName={user?.name || 'Dept Head'}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default DepartmentHeadDashboard;
