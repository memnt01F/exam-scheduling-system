import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import SchedulingManagement from '../components/admin/SchedulingManagement.jsx';
import ProctorSummary from '../components/admin/ProctorSummary.jsx';
import { useCourses } from '../context/CoursesContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBookings, createBooking, updateBooking, deleteBooking, getScheduledExams, getAssignments, bulkSaveAssignments } from '../services/api.js';
import AdminScheduleCalendar from '../components/admin/AdminScheduleCalendar.jsx';
import { BookOpen, BarChart2, Search, AlertTriangle, Users, CalendarDays, Plus, Pencil, X, Trash2, ChevronDown, UserCheck, Check } from 'lucide-react';
import { toast } from 'sonner';

const EXAM_TYPES = ['Major 1', 'Major 2', 'Major 3', 'Mid'];

const tabs = [
  { id: 'assignments', label: 'Course Assignments', icon: BookOpen },
  { id: 'users',       label: 'User Management',    icon: Users },
  { id: 'preferences', label: 'Schedule Management', icon: BarChart2 },
  { id: 'bookings',    label: 'Bookings',            icon: CalendarDays },
  { id: 'calendar',    label: 'Calendar',            icon: CalendarDays },
  { id: 'proctors',    label: 'Proctor Summary',     icon: UserCheck },
];

/* ── Searchable Select ── */
const SearchableSelect = ({ value, onChange, options, placeholder = '— Unassigned —' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => !search || o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 180 }}>
      <button
        type="button"
        className="form-input"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left', width: '100%' }}
        onClick={() => { setOpen(o => !o); setSearch(''); }}
      >
        <span style={{ color: selected ? 'inherit' : 'var(--clr-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, marginLeft: 4 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--clr-card)', border: '1px solid var(--clr-border)', borderRadius: 8, boxShadow: 'var(--shadow-md)', marginTop: 2 }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--clr-border)' }}>
            <input
              className="form-input"
              style={{ padding: '4px 8px', fontSize: 13 }}
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            <div
              style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--clr-muted)' }}
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
            >
              — Unassigned —
            </div>
            {filtered.map(o => (
              <div
                key={o.value}
                style={{ padding: '6px 12px', fontSize: 13, cursor: 'pointer', background: o.value === value ? 'var(--clr-primary-light, hsl(215 80% 95%))' : 'transparent', color: o.value === value ? 'var(--clr-primary)' : 'inherit' }}
                onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'var(--clr-hover, hsl(0 0% 96%))'; }}
                onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = 'transparent'; }}
                onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
              >
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--clr-muted)', textAlign: 'center' }}>No match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
                      <SearchableSelect
                        value={assignments[c.code] || ''}
                        onChange={val => setAssignments(prev => ({ ...prev, [c.code]: val }))}
                        options={coordinators.map(coord => ({ value: coord.id, label: coord.name }))}
                      />
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
const BLANK_USER = { name: '', email: '', password: '', department: '', isActive: true, selectedCourseCodes: [] };

const UsersTab = ({ managedDepts, deptCourses, deptUsers, addUser, updateUser, deleteUser, assignments, setAssignments }) => {
  const { user: authUser } = useAuth();
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(BLANK_USER);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [courseSearch, setCourseSearch] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = () => {
    setForm({ ...BLANK_USER, department: managedDepts[0] || '' });
    setModal({ mode: 'add' });
  };

  const openEdit = (u) => {
    const dept = managedDepts.includes(u.department) ? u.department : (managedDepts[0] || '');
    const currentCodes = Object.entries(assignments || {})
      .filter(([, id]) => id === u.id)
      .map(([code]) => code);
    setForm({ name: u.name, email: u.email, password: '', department: dept, isActive: u.isActive !== false, selectedCourseCodes: currentCodes });
    setModal({ mode: 'edit', data: u });
  };

  const closeModal = () => { setModal(null); setForm(BLANK_USER); setCourseSearch(''); };

  const handleDelete = async (u) => {
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    const res = await deleteUser(u.id, authUser?.name || 'Dept Head');
    if (res?.success !== false) toast.success('User deleted');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.email.trim()) return toast.error('Email is required');
    if (!form.department) return toast.error('Department is required');
    setSaving(true);
    if (modal.mode === 'add') {
      const res = await addUser(
        { name: form.name, email: form.email, role: 'coordinator', department: form.department, isActive: form.isActive, managedDepartments: [] },
        authUser?.name || 'Dept Head'
      );
      if (res?.success === false) { setSaving(false); return; }
      const newUserId = res?.user?._id;
      if (newUserId && form.selectedCourseCodes.length > 0) {
        try {
          const payload = form.selectedCourseCodes.map(code => ({ courseCode: code, coordinatorId: newUserId }));
          await bulkSaveAssignments(payload, authUser?.name || 'Dept Head');
          setAssignments(prev => {
            const next = { ...prev };
            form.selectedCourseCodes.forEach(code => { next[code] = newUserId; });
            return next;
          });
        } catch { toast.error('User added but course assignments could not be saved'); }
      }
      toast.success('User added');
    } else {
      const patch = { name: form.name, email: form.email, department: form.department, isActive: form.isActive };
      if (form.password.trim()) patch.password = form.password;
      const res = await updateUser(modal.data.id, patch, authUser?.name || 'Dept Head');
      if (res?.success === false) { setSaving(false); return; }
      {
        const currentCodes = Object.entries(assignments || {}).filter(([, id]) => id === modal.data.id).map(([code]) => code);
        const newCodes = form.selectedCourseCodes;
        const toAdd = newCodes.filter(c => !currentCodes.includes(c));
        const toRemove = currentCodes.filter(c => !newCodes.includes(c));
        if (toAdd.length > 0 || toRemove.length > 0) {
          try {
            const payload = [
              ...toAdd.map(code => ({ courseCode: code, coordinatorId: modal.data.id })),
              ...toRemove.map(code => ({ courseCode: code, coordinatorId: '' })),
            ];
            await bulkSaveAssignments(payload, authUser?.name || 'Dept Head');
            setAssignments(prev => {
              const next = { ...prev };
              toRemove.forEach(code => delete next[code]);
              toAdd.forEach(code => { next[code] = modal.data.id; });
              return next;
            });
          } catch { toast.error('User updated but course assignments could not be saved'); }
        }
      }
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
                    <td className="text-sm">{Object.values(assignments || {}).filter(id => id === u.id).length} course{Object.values(assignments || {}).filter(id => id === u.id).length !== 1 ? 's' : ''}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(u); }} title="Edit user">
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleDelete(u); }} title="Delete user">
                          <Trash2 size={14} color="var(--clr-danger)" />
                        </button>
                      </div>
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
                <label className="text-sm font-medium">Assigned Courses</label>
                <input
                  className="form-input"
                  placeholder="Search courses…"
                  value={courseSearch}
                  onChange={e => setCourseSearch(e.target.value)}
                  style={{ marginBottom: 8 }}
                  autoComplete="new-password"
                />
                <div style={{ border: '1px solid var(--clr-border)', borderRadius: 8, maxHeight: 160, overflowY: 'auto', padding: 4 }}>
                  {deptCourses.filter(c => {
                    const q = courseSearch.replace(/\s+/g, '').toLowerCase();
                    return !q || c.code.replace(/\s+/g, '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                  }).map(c => {
                    const selected = (form.selectedCourseCodes || []).includes(c.code);
                    return (
                      <div
                        key={c.code}
                        onClick={() => set('selectedCourseCodes', selected
                          ? (form.selectedCourseCodes || []).filter(x => x !== c.code)
                          : [...(form.selectedCourseCodes || []), c.code]
                        )}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                          borderRadius: 6, cursor: 'pointer', fontSize: 13,
                          background: selected ? 'var(--clr-primary-light, hsl(215 80% 95%))' : 'transparent',
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: selected ? 'none' : '1.5px solid var(--clr-border)',
                          background: selected ? 'var(--clr-primary)' : 'transparent',
                          color: '#fff',
                        }}>
                          {selected && <Check size={12} />}
                        </span>
                        <span className="font-medium">{c.code}</span>
                        <span style={{ color: 'var(--clr-muted)' }}>— {c.name}</span>
                      </div>
                    );
                  })}
                  {deptCourses.length === 0 && (
                    <div style={{ padding: 12, textAlign: 'center', color: 'var(--clr-muted)', fontSize: 13 }}>No courses in your department</div>
                  )}
                </div>
                {(form.selectedCourseCodes || []).length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 4 }}>
                    {form.selectedCourseCodes.length} course{form.selectedCourseCodes.length !== 1 ? 's' : ''} selected
                  </div>
                )}
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
  const { academicTerms } = useCourses();
  const navigate = useNavigate();
  const [bookings, setBookings]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [selectedTermId, setSelectedTermId] = useState(() => localStorage.getItem('depthead_bookings_termId') || '');

  const handleTermChange = (id) => {
    setSelectedTermId(id);
    localStorage.setItem('depthead_bookings_termId', id);
  };

  useEffect(() => {
    if (!academicTerms.length || selectedTermId) return;
    const active = academicTerms.find(t => t.isActive) || academicTerms[0];
    if (active) {
      const id = active._serverId || active.id;
      setSelectedTermId(id);
      localStorage.setItem('depthead_bookings_termId', id);
    }
  }, [academicTerms, selectedTermId]);

  const phase2Courses = useMemo(() => deptCourses.filter(c => c.level >= 3), [deptCourses]);

  const depts = useMemo(() => [...new Set(phase2Courses.map(c => c.department))].sort(), [phase2Courses]);
  const courseByCode = useMemo(() => Object.fromEntries(phase2Courses.map(c => [c.code, c])), [phase2Courses]);
  const deptCodes = useMemo(() => new Set(phase2Courses.map(c => c.code)), [phase2Courses]);

  const fetchBookings = useCallback(async () => {
    if (!selectedTermId) return;
    setLoading(true);
    try {
      const all = await getBookings({ termId: selectedTermId, phaseNumber: 2 });
      const deptBookings = (Array.isArray(all) ? all : []).filter(b => deptCodes.has(b.courseCode));
      setBookings(deptBookings);
    } catch {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [selectedTermId, deptCodes]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const goToBooking = (course, booking = null, presetType = null) => {
    const qs = new URLSearchParams();
    qs.set('from', 'deptHead');
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

  const PHASE2_EXAM_TYPES = ['Major 1', 'Major 2', 'Mid'];

  const allRows = useMemo(() => {
    const byCode = {};
    bookings.forEach(b => {
      if (!byCode[b.courseCode]) byCode[b.courseCode] = {};
      byCode[b.courseCode][b.examType] = b;
    });
    return phase2Courses
      .filter(c => {
        if (levelFilter && c.level !== Number(levelFilter)) return false;
        if (deptFilter && c.department !== deptFilter) return false;
        if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .map(c => ({ course: c, bookingsByType: byCode[c.code] || {} }));
  }, [phase2Courses, bookings, levelFilter, deptFilter, search]);

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 'auto' }} value={selectedTermId} onChange={e => handleTermChange(e.target.value)}>
          {!academicTerms.length && <option value="">Loading terms…</option>}
          {academicTerms.map(t => <option key={t._serverId || t.id} value={t._serverId || t.id}>{t.name}</option>)}
        </select>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--clr-muted)' }} />
          <input className="form-input" placeholder="Search by course…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <select className="form-input" style={{ width: 'auto' }} value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          <option value="">All Levels</option>
          <option value="3">Level 3</option>
          <option value="4">Level 4</option>
        </select>
        {depts.length > 1 && (
          <select className="form-input" style={{ width: 'auto' }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => {
          const row = allRows.find(r => PHASE2_EXAM_TYPES.some(t => !r.bookingsByType[t] || r.bookingsByType[t].status === 'cancelled'));
          if (row) {
            const type = PHASE2_EXAM_TYPES.find(t => !row.bookingsByType[t] || row.bookingsByType[t].status === 'cancelled');
            goToBooking(row.course, null, type);
          }
        }}>
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
                    <th>Level</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Proctors</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map(({ course: c, bookingsByType }) => {
                    const isActive = t => bookingsByType[t] && bookingsByType[t].status !== 'cancelled';
                    const majorActive = ['Major 1', 'Major 2'].some(isActive);
                    const midActive = isActive('Mid');
                    const activeBookings = PHASE2_EXAM_TYPES.map(t => bookingsByType[t]).filter(b => b && b.status !== 'cancelled');
                    const earliest = [...activeBookings].sort((a, b) => new Date(a.examDate) - new Date(b.examDate))[0];

                    const visibleTypes = PHASE2_EXAM_TYPES.filter(t => {
                      if (t === 'Mid' && majorActive) return false;
                      if ((t === 'Major 1' || t === 'Major 2') && midActive) return false;
                      return true;
                    });
                    const bookableTypes = visibleTypes.filter(t => !isActive(t));
                    const manageableTypes = PHASE2_EXAM_TYPES.filter(isActive);

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
                            else if (val.startsWith('cancel|')) handleCancel(bookingsByType[val.slice(7)]);
                            e.target.value = '';
                          }}>
                            <option value="" disabled>Select action</option>
                            {bookableTypes.length > 0 && <option value="book">Book</option>}
                            {manageableTypes.map(type => (
                              <option key={`reschedule|${type}`} value={`reschedule|${type}`}>Reschedule {type}</option>
                            ))}
                            {manageableTypes.map(type => (
                              <option key={`cancel|${type}`} value={`cancel|${type}`}>Cancel {type}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {allRows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>
                        No courses found for your department{phase2Courses.length !== 1 ? 's' : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

/* ── Calendar Tab ── */
const CalendarTab = () => {
  const { academicTerms } = useCourses();
  const [selectedTermId, setSelectedTermId] = useState('');
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!academicTerms.length || selectedTermId) return;
    const active = academicTerms.find(t => t.isActive) || academicTerms[0];
    if (active) setSelectedTermId(active._id || active.id);
  }, [academicTerms, selectedTermId]);

  useEffect(() => {
    if (!selectedTermId) return;
    setLoading(true);
    getScheduledExams({ termId: selectedTermId, phase: 0 })
      .then(data => setExams(Array.isArray(data) ? data.filter(e => e.status !== 'pending') : []))
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  }, [selectedTermId]);

  const selectedTerm = academicTerms.find(t => (t._id || t.id) === selectedTermId);

  if (!academicTerms.length) return <p className="text-sm text-muted">No academic terms available.</p>;

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="text-sm font-medium">Term</label>
        <select className="form-input" style={{ width: 'auto' }} value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}>
          {academicTerms.map(t => <option key={t._id || t.id} value={t._id || t.id}>{t.name}</option>)}
        </select>
      </div>
      {loading && <p className="text-sm text-muted">Loading schedule…</p>}
      {!loading && selectedTerm && (
        <AdminScheduleCalendar
          exams={exams}
          termId={selectedTermId}
          phaseNumber={0}
          term={selectedTerm}
          readOnly
        />
      )}
    </div>
  );
};

/* ── Main Dashboard ── */
const DepartmentHeadDashboard = () => {
  const { user } = useAuth();
  const { courses, users, updateUser: updateUserCtx, addUser: addUserCtx, deleteUser: deleteUserCtx } = useCourses();

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

  // Load all assignments globally (no term filter)
  useEffect(() => {
    getAssignments()
      .then(data => {
        const init = {};
        if (Array.isArray(data)) {
          data.forEach(a => { init[a.courseCode] = String(a.coordinatorId); });
        }
        setAssignments(init);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = deptCourses.map(c => ({
        courseCode: c.code,
        coordinatorId: assignments[c.code] || '',
      }));
      await bulkSaveAssignments(payload, user?.name || 'Dept Head');
      toast.success('Assignments saved successfully');
    } catch (err) {
      toast.error(err?.message || 'Failed to save assignments');
    } finally {
      setSaving(false);
    }
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
            deptCourses={deptCourses}
            deptUsers={deptUsers}
            addUser={addUserCtx}
            updateUser={updateUserCtx}
            deleteUser={deleteUserCtx}
            assignments={assignments}
            setAssignments={setAssignments}
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

        {activeTab === 'calendar' && <CalendarTab />}

        {activeTab === 'proctors' && (
          <ProctorSummary restrictedDepts={managedDepts} />
        )}
      </div>
    </DashboardLayout>
  );
};

export default DepartmentHeadDashboard;
