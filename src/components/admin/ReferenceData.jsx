import { useState, useRef } from 'react';
import { useCourses } from '../../context/CoursesContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { departments } from '../../lib/mock-admin-data.js';
import {
  Database, Search, Trash2, Plus, Upload, X, AlertTriangle, CheckCircle2, FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Level 1 course list (from requirements) ─────────────────────────────────
// These courses are always Level 1 regardless of their course number.
// Everything else is assigned by course number: 1XX/2XX = Level 2, 3XX/4XX = Level 3/4.
const LEVEL_1_CODES = new Set([
  'CHEM101','CHEM102','STAT201','MATH101','MATH208','MATH102','MATH201',
  'BUS200','PHYS101','PHYS102','IAS111','IAS212','IAS322','COE202',
  'CGS392','ENGL101','ENGL214','COE292','ICS104','ENGL102','ISE291',
  'IAS121','IAS330','IAS331','IAS430','ICS108',
  // GS prefix courses are always Level 1
]);

// Department code → full department name mapping from KFUPM
const DEPT_MAP = {
  ICS: 'Information & Computer Science',
  COE: 'Computer Engineering',
  EE:  'Electrical Engineering',
  ME:  'Mechanical Engineering',
  CE:  'Civil & Environmental Engineering',
  CHEM:'Chemistry',
  MATH:'Mathematics',
  PHYS:'Physics',
  STAT:'Mathematics',
  BUS: 'Business Administration',
  IAS: 'Islamic & Arabic Studies',
  ENGL:'English Language Department',
  ACCT:'Accounting & Finance',
  FIN: 'Accounting & Finance',
  MGT: 'Management & Marketing',
  MKT: 'Management & Marketing',
  ISE: 'Industrial and Systems Engineering',
  PE:  'Petroleum Engineering',
  ARE: 'Arch. Engg & Construction Mgt.',
  GS:  'General Studies',
  CGS: 'General Studies',
  SE:  'Systems Engineering',
  AERO:'Aerospace Engineering',
  MSE: 'Material Sciences and Engineering',
  GEO: 'Geosciences',
};

/**
 * Normalize a course code string — remove spaces, uppercase.
 */
function normalizeCode(raw) {
  return String(raw || '').replace(/\s+/g, '').toUpperCase().trim();
}

/**
 * Extract the prefix (letters) and number from a course code.
 * e.g. "ICS 253" → { prefix: "ICS", num: 253 }
 *      "MATH101" → { prefix: "MATH", num: 101 }
 */
function parseCourseCode(code) {
  const norm = normalizeCode(code);
  const match = norm.match(/^([A-Z]+)(\d+)/);
  if (!match) return { prefix: '', num: 0 };
  return { prefix: match[1], num: parseInt(match[2]) };
}

/**
 * Auto-assign a level based on:
 * 1. If the normalized code is in LEVEL_1_CODES → Level 1
 * 2. If the prefix is "GS" → Level 1
 * 3. Course number 1XX or 2XX → Level 2
 * 4. Course number 3XX or 4XX → Level 3 or 4 respectively
 * 5. Otherwise → Level 2 (safe default)
 */
function assignLevel(code) {
  const norm = normalizeCode(code);
  if (LEVEL_1_CODES.has(norm)) return 1;
  const { prefix, num } = parseCourseCode(code);
  if (prefix === 'GS') return 1;
  if (num >= 100 && num < 300) return 2;
  if (num >= 300 && num < 400) return 3;
  if (num >= 400) return 4;
  return 2;
}

/**
 * Infer department from course code prefix.
 */
function inferDepartment(code) {
  const { prefix } = parseCourseCode(code);
  return DEPT_MAP[prefix] || '';
}

/**
 * Parse an XLSX file using SheetJS loaded from CDN.
 * Returns a promise that resolves to an array of row objects.
 */
function parseXlsx(file) {
  return new Promise((resolve, reject) => {
    // Dynamically load SheetJS if not already available
    if (window.XLSX) {
      readXlsx(file, resolve, reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => readXlsx(file, resolve, reject);
    script.onerror = () => reject(new Error('Failed to load Excel parser library'));
    document.head.appendChild(script);
  });
}

function readXlsx(file, resolve, reject) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = window.XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
      resolve(rows);
    } catch (err) {
      reject(err);
    }
  };
  reader.onerror = () => reject(new Error('Failed to read file'));
  reader.readAsArrayBuffer(file);
}

/**
 * Parse a CSV file into an array of row objects.
 */
function parseCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) { resolve([]); return; }
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1).map(line => {
          const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
          const obj = {};
          headers.forEach((h, i) => { obj[h] = cols[i] || ''; });
          return obj;
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Find a value in a row object by trying multiple possible column names.
 * KFUPM course offering Excel has columns like "Course No.", "Title", "Dept", etc.
 */
function findField(row, candidates) {
  for (const key of Object.keys(row)) {
    const norm = key.toLowerCase().replace(/[\s._\-#]/g, '');
    if (candidates.some(c => norm.includes(c))) {
      const val = String(row[key] || '').trim();
      if (val) return val;
    }
  }
  return '';
}

/**
 * Convert a raw row from the KFUPM course offering Excel into a course object.
 * Handles both KFUPM's own export format and a simple Code/Name/Level/Dept CSV.
 */
function rowToCourse(row) {
  // Try KFUPM format first (columns: Course No. / Title / Dept / etc.)
  const code = findField(row, ['courseno','coursecode','code','no']);
  const name = findField(row, ['title','coursename','name','description']);
  if (!code || !name) return null;

  // Department: try from row, fall back to inferring from code
  const deptRaw = findField(row, ['dept','department']);
  const department = deptRaw
    ? (DEPT_MAP[deptRaw.toUpperCase()] || deptRaw)
    : inferDepartment(code);

  return {
    code: normalizeCode(code),
    name: name.trim(),
    level: assignLevel(code),
    department,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const ReferenceData = () => {
  const { courses, addCourse, removeCourse } = useCourses();
  const { user } = useAuth();
  const adminName = user?.name || 'Admin';

  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // { courses, duplicates, file }
  const fileInputRef = useRef(null);

  const allDepts = [...new Set([...departments, ...courses.map(c => c.department)])].filter(Boolean).sort();
  const existingCodes = new Set(courses.map(c => normalizeCode(c.code)));

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

  const handleDelete = async (id) => {
    await removeCourse(id, adminName);
    setConfirmDelete(null);
    toast.success('Course deleted successfully');
  };

  // Step 1: user picks a file → parse and show preview
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImporting(true);
    try {
      let rows = [];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        rows = await parseXlsx(file);
      } else {
        rows = await parseCsv(file);
      }

      if (rows.length === 0) {
        toast.error('No data found in file');
        setImporting(false);
        return;
      }

      // Parse rows into courses
      const parsed = rows.map(rowToCourse).filter(Boolean);
      if (parsed.length === 0) {
        toast.error('Could not find Course Code / Title columns. Check the file format.');
        setImporting(false);
        return;
      }

      // Deduplicate within the file
      const seen = new Set();
      const unique = parsed.filter(c => {
        if (seen.has(c.code)) return false;
        seen.add(c.code);
        return true;
      });

      // Split into new vs already existing in DB
      const newCourses = unique.filter(c => !existingCodes.has(c.code));
      const duplicates = unique.filter(c => existingCodes.has(c.code));

      setImportPreview({ courses: newCourses, duplicates, fileName: file.name });
    } catch (err) {
      toast.error(err.message || 'Failed to parse file');
    } finally {
      setImporting(false);
    }
  };

  // Step 2: user confirms → import
  const handleConfirmImport = async () => {
    if (!importPreview?.courses?.length) { setImportPreview(null); return; }
    const toImport = importPreview.courses;
    setImportPreview(null);
    setImporting(true);

    let count = 0;
    let failed = 0;
    for (const c of toImport) {
      try {
        await addCourse({ ...c, id: `imported-${Date.now()}-${count}`, bookings: {} }, adminName);
        count++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    if (count > 0) toast.success(`${count} course(s) imported successfully${failed ? ` (${failed} failed)` : ''}`);
    else toast.error('Import failed — no courses were added');
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
          <span className="text-xs text-muted">{courses.length} total</span>
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

      {/* Hidden file input — accepts xlsx, xls, csv */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Import Preview Modal */}
      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onConfirm={handleConfirmImport}
          onCancel={() => setImportPreview(null)}
        />
      )}

      {/* Add Course Modal */}
      {showAddModal && (
        <AddCourseModal
          departments={allDepts}
          onClose={() => setShowAddModal(false)}
          onSave={async (c) => { await addCourse(c, adminName); setShowAddModal(false); toast.success('Course added successfully'); }}
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

// ─── Import Preview Modal ──────────────────────────────────────────────────────

const ImportPreviewModal = ({ preview, onConfirm, onCancel }) => {
  const { courses, duplicates, fileName } = preview;
  const [tab, setTab] = useState('new');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 640, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div className="card-title"><FileSpreadsheet size={16} /> Import Preview — {fileName}</div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><X size={16} /></button>
        </div>

        <div style={{ padding: '0 1rem', flexShrink: 0 }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--clr-muted-bg)', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 22, fontWeight: 500, color: 'var(--clr-primary)' }}>{courses.length}</p>
              <p style={{ fontSize: 12, color: 'var(--clr-muted)' }}>New courses to import</p>
            </div>
            <div style={{ background: 'var(--clr-muted-bg)', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 22, fontWeight: 500, color: 'var(--clr-warning, #e68a00)' }}>{duplicates.length}</p>
              <p style={{ fontSize: 12, color: 'var(--clr-muted)' }}>Already exist (will be skipped)</p>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--clr-border)', marginBottom: 0 }}>
            {['new', 'skip'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '6px 16px', fontSize: 13, border: 'none', background: 'none',
                  cursor: 'pointer', fontWeight: tab === t ? 500 : 400,
                  borderBottom: tab === t ? '2px solid var(--clr-primary)' : '2px solid transparent',
                  color: tab === t ? 'var(--clr-primary)' : 'var(--clr-muted)',
                }}
              >
                {t === 'new' ? `To Import (${courses.length})` : `Skipped (${duplicates.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 1rem' }}>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Level</th><th>Department</th></tr>
            </thead>
            <tbody>
              {(tab === 'new' ? courses : duplicates).map((c, i) => (
                <tr key={i}>
                  <td className="font-medium">{c.code}</td>
                  <td>{c.name}</td>
                  <td><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                  <td className="text-sm">{c.department || '—'}</td>
                </tr>
              ))}
              {(tab === 'new' ? courses : duplicates).length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16, color: 'var(--clr-muted)' }}>None</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 1rem', borderTop: '1px solid var(--clr-border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          {courses.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--clr-warning, #e68a00)', fontSize: 13, marginRight: 'auto' }}>
              <AlertTriangle size={14} /> All courses already exist — nothing to import
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--clr-primary)', fontSize: 13, marginRight: 'auto' }}>
              <CheckCircle2 size={14} /> {courses.length} course(s) ready to import
            </div>
          )}
          <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={onConfirm}
            disabled={courses.length === 0}
          >
            Import {courses.length} Course(s)
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Add Course Modal ──────────────────────────────────────────────────────────

const AddCourseModal = ({ departments, onClose, onSave, onImport }) => {
  const [form, setForm] = useState({ code: '', name: '', level: 1, department: departments[0] || '' });
  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Auto-assign level when code changes
  const handleCodeChange = (val) => {
    const level = assignLevel(val);
    const department = inferDepartment(val) || form.department;
    setForm(prev => ({ ...prev, code: val, level, department }));
  };

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error('Course Code and Name are required'); return; }
    onSave({ ...form, code: normalizeCode(form.code), id: `c-${Date.now()}`, bookings: {} });
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
            <input
              className="form-input"
              value={form.code}
              onChange={e => handleCodeChange(e.target.value)}
              placeholder="e.g. ICS 108"
            />
            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
              Level and department are assigned automatically from the code.
            </p>
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
            <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={onImport}>
              <Upload size={14} /> Import Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Confirm Dialog ────────────────────────────────────────────────────────────

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

