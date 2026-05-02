import { useState, useRef, useEffect } from 'react';
import { departments } from '../../lib/mock-admin-data.js';
import { useCourses } from '../../context/CoursesContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Users, Search, Trash2, Plus, Upload, UserMinus, X, Check, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';

const UserManagement = () => {
  const { users, setUsers, addUser, updateUser: updateUserApi, deleteUser: deleteUserApi, addAuditLog, refreshAuditLogs } = useCourses();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const fileInputRef = useRef(null);
  const { user: currentUser } = useAuth();
  const adminName = currentUser?.name || 'Admin';

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleActive = async (id) => {
    const target = users.find(u => u.id === id);
    const newActive = !target?.isActive;
    await updateUserApi(id, { isActive: newActive }, adminName);
    addAuditLog({
      action: newActive ? 'user_activated' : 'user_deactivated',
      user: adminName,
      details: `${newActive ? 'Activated' : 'Deactivated'} ${target?.name}`,
    });
    toast.success('User status updated');
  };

  const deleteUser = async (id) => {
    const target = users.find(u => u.id === id);
    await deleteUserApi(id, adminName);
    setConfirmDelete(null);
    setEditingUser(null);
    addAuditLog({
      action: 'user_deleted',
      user: adminName,
      details: `Deleted user ${target?.name}`,
    });
    toast.success('User deleted successfully');
  };

  const updateUser = async (updated) => {
    const old = users.find(u => u.id === updated.id);
    await updateUserApi(updated.id, {
      name: updated.name,
      email: updated.email,
      role: updated.role,
      department: updated.department,
      assignedCourses: updated.assignedCourses,
      isActive: updated.isActive,
    }, adminName);
    setEditingUser(null);
    if (old && old.role !== updated.role) {
      addAuditLog({
        action: 'user_role_changed',
        user: adminName,
        details: `Changed ${updated.name} role from ${old.role} to ${updated.role}`,
      });
    }
    toast.success('User updated successfully');
  };

  const unassignAllCoordinators = async () => {
    const coords = users.filter(u => u.role === 'coordinator');
    // Clear assignedCourses on each coordinator (do NOT delete the user).
    for (const c of coords) {
      // eslint-disable-next-line no-await-in-loop
      await updateUserApi(c.id, { assignedCourses: [] }, adminName);
    }
    addAuditLog({
      action: 'user_role_changed',
      user: adminName,
      details: `Unassigned all courses from ${coords.length} coordinator(s)`,
      role: 'admin',
    });
    setConfirmUnassign(false);
    refreshAuditLogs?.();
    toast.success('All coordinators have been unassigned from their courses.');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { toast.error('File is empty or has no data rows'); return; }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = headers.indexOf('name');
        const emailIdx = headers.indexOf('email');
        const roleIdx = headers.indexOf('role');
        const deptIdx = headers.indexOf('department');
        const statusIdx = headers.indexOf('status');
        if (nameIdx === -1 || emailIdx === -1) { toast.error('File must have Name and Email columns'); return; }
        const newUsers = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (!cols[nameIdx] || !cols[emailIdx]) continue;
          const role = cols[roleIdx]?.toLowerCase() || 'coordinator';
          const validRole = ['coordinator', 'committee', 'admin'].includes(role) ? role : 'coordinator';
          newUsers.push({
            name: cols[nameIdx],
            email: cols[emailIdx],
            role: validRole,
            department: cols[deptIdx] || '',
            isActive: statusIdx !== -1 ? cols[statusIdx]?.toLowerCase() !== 'inactive' : true,
            assignedCourses: [],
          });
        }
        if (newUsers.length === 0) { toast.error('No valid users found in file'); return; }
        // Persist each row through the backend (falls back to local on offline).
        for (const u of newUsers) {
          // eslint-disable-next-line no-await-in-loop
          await addUser(u, adminName);
        }
        toast.success(`${newUsers.length} user(s) imported successfully`);
      } catch { toast.error('Failed to parse file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const roleLabel = (r) => r === 'coordinator' ? 'Coordinator' : r === 'committee' ? 'Committee' : 'Admin';

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--clr-muted)' }} />
          <input className="form-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> Add User
        </button>
        <button className="btn btn-outline btn-sm" style={{ borderColor: 'var(--clr-danger)', color: 'var(--clr-danger)' }} onClick={() => setConfirmUnassign(true)}>
          <UserMinus size={14} /> Unassign All Coordinators
        </button>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-content" style={{ paddingTop: 16 }}>
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => setEditingUser({ ...u })}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-sm text-muted">{u.email}</td>
                  <td><span className="badge badge-outline" style={{ fontSize: 10 }}>{roleLabel(u.role)}</span></td>
                  <td className="text-sm">{u.department}</td>
                  <td>
                    <span
                      className={`badge ${u.isActive ? 'badge-primary' : 'badge-outline'}`}
                      style={{ fontSize: 10, cursor: 'pointer', userSelect: 'none' }}
                      onClick={(e) => { e.stopPropagation(); toggleActive(u.id); }}
                      title="Click to toggle status"
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setEditingUser({ ...u }); }} title="Edit user">
                        <Pencil size={14} />
                      </button>
                      
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setConfirmDelete(u.id); }} title="Delete user">
                        <Trash2 size={14} color="var(--clr-danger)" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>No users found</td></tr>
              )}
            </tbody>
          </table></div>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={handleImport} />

      {/* Add User Modal */}
      {showAddModal && <AddUserModal departments={departments} onClose={() => setShowAddModal(false)} onSave={async (u) => { await addUser(u, adminName); setShowAddModal(false); addAuditLog({ action: 'user_created', user: adminName, details: `Created user ${u.name} (${u.role})` }); toast.success('User added successfully'); }} onImport={() => { setShowAddModal(false); fileInputRef.current?.click(); }} />}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          departments={departments}
          onClose={() => setEditingUser(null)}
          onSave={updateUser}
          onDelete={(id) => setConfirmDelete(id)}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete this user? This action cannot be undone."
          onConfirm={() => deleteUser(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Unassign Confirmation */}
      {confirmUnassign && (
        <ConfirmDialog
          message="Are you sure you want to unassign all coordinators?"
          onConfirm={unassignAllCoordinators}
          onCancel={() => setConfirmUnassign(false)}
        />
      )}
    </div>
  );
};

/* ── Edit User Modal ── */
const EditUserModal = ({ user, departments, onClose, onSave, onDelete }) => {
  const { courses } = useCourses();
  const [form, setForm] = useState({ ...user });
  const [assignedCourseIds, setAssignedCourseIds] = useState([]);
  const [courseSearch, setCourseSearch] = useState('');
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  useEffect(() => {
    const mapped = (user.assignedCourses || []).map((val) => {
      const raw = String(val || '').trim();
      const course = courses.find(c => String(c.id) === raw || String(c._serverId || '') === raw || String(c.code || '').replace(/\s+/g, '').toUpperCase() === raw.replace(/\s+/g, '').toUpperCase());
      return course ? course.id : null;
    }).filter(Boolean);
    setAssignedCourseIds([...new Set(mapped)]);
  }, [user.assignedCourses, courses]);

  const toggleCourse = (id) => {
    setAssignedCourseIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const filteredCourses = courses.filter(c => {
    const q = courseSearch.replace(/\s+/g, '').toLowerCase();
    return !q || c.code.replace(/\s+/g, '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error('Name and Email are required'); return; }
    if (form.role === 'coordinator' && assignedCourseIds.length === 0) { toast.error('Please assign at least one course'); return; }
    onSave({ ...form, assignedCourses: form.role === 'coordinator' ? assignedCourseIds : [] });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: 520, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><Pencil size={16} /> Edit User</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="card-content space-y-3" style={{ overflowY: 'auto' }}>
          <div>
            <label className="text-sm font-medium">Name</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <select className="form-input" value={form.role} onChange={e => { set('role', e.target.value); if (e.target.value !== 'coordinator') setAssignedCourseIds([]); }}>
              <option value="coordinator">Coordinator</option>
              <option value="committee">Committee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {form.role === 'coordinator' && (
            <div>
              <label className="text-sm font-medium">Department</label>
              <select className="form-input" value={form.department} onChange={e => set('department', e.target.value)}>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="form-input" value={form.isActive ? 'active' : 'inactive'} onChange={e => set('isActive', e.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Assigned Courses — only for coordinators */}
          {form.role === 'coordinator' && (
            <div>
              <label className="text-sm font-medium">Assigned Courses</label>
              <input
                className="form-input"
                placeholder="Search courses..."
                value={courseSearch}
                onChange={e => setCourseSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ border: '1px solid var(--clr-border)', borderRadius: 8, maxHeight: 160, overflowY: 'auto', padding: 4 }}>
                {filteredCourses.length === 0 && (
                  <div style={{ padding: 12, textAlign: 'center', color: 'var(--clr-muted)', fontSize: 13 }}>No courses found</div>
                )}
                {filteredCourses.map(c => {
                  const selected = assignedCourseIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleCourse(c.id)}
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
              {assignedCourseIds.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 4 }}>
                  {assignedCourseIds.length} course{assignedCourseIds.length !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingTop: 8, alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>Save Changes</button>
            <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-sm"
              style={{ marginLeft: 'auto', background: 'var(--clr-danger)', color: '#fff', border: 'none' }}
              onClick={() => onDelete(form.id)}
            >
              <Trash2 size={14} /> Delete User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Add User Modal ── */
const AddUserModal = ({ departments, onClose, onSave, onImport }) => {
  const { courses } = useCourses();
  const [form, setForm] = useState({ name: '', email: '', role: 'coordinator', department: departments[0] || '', isActive: true });
  const [assignedCourseIds, setAssignedCourseIds] = useState([]);
  const [courseSearch, setCourseSearch] = useState('');
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleCourse = (id) => {
    setAssignedCourseIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const filteredCourses = courses.filter(c => {
    const q = courseSearch.replace(/\s+/g, '').toLowerCase();
    return !q || c.code.replace(/\s+/g, '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error('Name and Email are required'); return; }
    if (form.role === 'coordinator' && assignedCourseIds.length === 0) { toast.error('Please assign at least one course to the coordinator'); return; }
    onSave({ ...form, id: `u-${Date.now()}`, assignedCourses: form.role === 'coordinator' ? assignedCourseIds : [] });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 480, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><Plus size={16} /> Add New User</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
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
            <select className="form-input" value={form.role} onChange={e => { set('role', e.target.value); if (e.target.value !== 'coordinator') setAssignedCourseIds([]); }}>
              <option value="coordinator">Coordinator</option>
              <option value="committee">Committee</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {form.role === 'coordinator' && (
            <div>
              <label className="text-sm font-medium">Department</label>
              <select className="form-input" value={form.department} onChange={e => set('department', e.target.value)}>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Status</label>
            <select className="form-input" value={form.isActive ? 'active' : 'inactive'} onChange={e => set('isActive', e.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {form.role === 'coordinator' && (
            <div>
              <label className="text-sm font-medium">Assigned Courses</label>
              <input
                className="form-input"
                placeholder="Search courses..."
                value={courseSearch}
                onChange={e => setCourseSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <div style={{ border: '1px solid var(--clr-border)', borderRadius: 8, maxHeight: 160, overflowY: 'auto', padding: 4 }}>
                {filteredCourses.length === 0 && (
                  <div style={{ padding: 12, textAlign: 'center', color: 'var(--clr-muted)', fontSize: 13 }}>No courses found</div>
                )}
                {filteredCourses.map(c => {
                  const selected = assignedCourseIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleCourse(c.id)}
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
              {assignedCourseIds.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 4 }}>
                  {assignedCourseIds.length} course{assignedCourseIds.length !== 1 ? 's' : ''} selected
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
            <button className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={onImport}><Upload size={14} /> Import</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Confirm Dialog ── */
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
    <div className="card" style={{ width: 380, maxWidth: '90vw' }}>
      <div className="card-content" style={{ padding: 24 }}>
        <p className="text-sm" style={{ marginBottom: 16 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-sm" style={{ background: 'var(--clr-danger)', color: '#fff', border: 'none' }} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  </div>
);

export default UserManagement;
