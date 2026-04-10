import { useState, useRef } from 'react';
import { useCourses } from '../../context/CoursesContext.jsx';
import { departments } from '../../lib/mock-admin-data.js';
import {
  Database, Search, Trash2, Plus, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';

const ReferenceData = () => {
  const { courses, addCourse, removeCourse } = useCourses();
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileInputRef = useRef(null);

  const allDepts = [...new Set([...departments, ...courses.map(c => c.department)])].sort();

  const filtered = courses.filter(c => {
    if (filterLevel !== 'all' && c.level !== parseInt(filterLevel)) return false;
    if (filterDept !== 'all' && c.department !== filterDept) return false;
    if (search) {
      const q = search.toLowerCase().replace(/\s+/g, '');
      const codeNorm = c.code.toLowerCase().replace(/\s+/g, '');
      if (!codeNorm.includes(q) && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const handleDelete = (id) => {
    removeCourse(id);
    setConfirmDelete(null);
    toast.success('Course deleted successfully');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { toast.error('File is empty or has no data rows'); return; }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));
        const codeIdx = headers.findIndex(h => h.includes('code'));
        const nameIdx = headers.findIndex(h => h.includes('name'));
        const levelIdx = headers.findIndex(h => h.includes('level'));
        const deptIdx = headers.findIndex(h => h.includes('department'));
        if (codeIdx === -1 || nameIdx === -1) { toast.error('File must have Course Code and Course Name columns'); return; }
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (!cols[codeIdx] || !cols[nameIdx]) continue;
          const levelRaw = cols[levelIdx]?.replace(/[^0-9]/g, '') || '1';
          const level = Math.max(1, Math.min(4, parseInt(levelRaw) || 1));
          addCourse({
            id: `imported-${Date.now()}-${i}`,
            code: cols[codeIdx],
            name: cols[nameIdx],
            level,
            department: cols[deptIdx] || '',
            bookings: {},
          });
          count++;
        }
        if (count === 0) { toast.error('No valid courses found in file'); return; }
        toast.success(`${count} course(s) imported successfully`);
      } catch { toast.error('Failed to parse file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--clr-muted)' }} />
          <input
            className="form-input"
            placeholder="Search course code or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select className="form-input" style={{ width: 'auto', minWidth: 140 }} value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
          <option value="all">All Levels</option>
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
          <option value="3">Level 3</option>
          <option value="4">Level 4</option>
        </select>
        <select className="form-input" style={{ width: 'auto', minWidth: 180 }} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="all">All Departments</option>
          {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
          <Plus size={14} /> Add Course
        </button>
      </div>

      {/* Course List */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Database size={16} /> Course List</div>
        </div>
        <div className="card-content">
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Level</th><th>Department</th><th style={{ width: 50 }}></th></tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td className="font-medium">{c.code}</td>
                  <td>{c.name}</td>
                  <td><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                  <td className="text-sm">{c.department}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(c.id)} title="Delete course">
                      <Trash2 size={14} color="var(--clr-danger)" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>No courses found</td></tr>
              )}
            </tbody>
          </table></div>
        </div>
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={handleImport} />

      {/* Add Course Modal */}
      {showAddModal && (
        <AddCourseModal
          departments={allDepts}
          onClose={() => setShowAddModal(false)}
          onSave={(c) => { addCourse(c); setShowAddModal(false); toast.success('Course added successfully'); }}
          onImport={() => { setShowAddModal(false); fileInputRef.current?.click(); }}
        />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete this course?"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};

/* ── Add Course Modal ── */
const AddCourseModal = ({ departments, onClose, onSave, onImport }) => {
  const [form, setForm] = useState({ code: '', name: '', level: 1, department: departments[0] || '' });
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error('Course Code and Name are required'); return; }
    onSave({ ...form, id: `c-${Date.now()}`, bookings: {} });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 440, maxWidth: '90vw' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><Plus size={16} /> Add New Course</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="card-content space-y-3">
          <div>
            <label className="text-sm font-medium">Course Code</label>
            <input className="form-input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. ICS 108" />
          </div>
          <div>
            <label className="text-sm font-medium">Course Name</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Digital Logic" />
          </div>
          <div>
            <label className="text-sm font-medium">Level</label>
            <select className="form-input" value={form.level} onChange={e => set('level', parseInt(e.target.value))}>
              <option value={1}>L1</option>
              <option value={2}>L2</option>
              <option value={3}>L3</option>
              <option value={4}>L4</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <select className="form-input" value={form.department} onChange={e => set('department', e.target.value)}>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
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

export default ReferenceData;
