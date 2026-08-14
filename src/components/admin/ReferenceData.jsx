import { useState, useRef, useMemo, useEffect } from 'react';
import { useCourses } from '../../context/CoursesContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Database, Search, Trash2, Plus, Upload, X, AlertTriangle, CheckCircle2, FileSpreadsheet, Pencil,
  RefreshCw, ArrowDownToLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { importCourseOfferings } from '../../services/api.js';

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
 * UX convenience only — pre-fills the Level field in the Add Course modal as the admin types.
 * NOT authoritative for data writes. Canonical implementation: backend/utils/assignLevel.js
 * If these rules change, update both files.
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
  const { courses, addCourse, removeCourse, updateCourse, academicTerms, refreshCourses } = useCourses();
  const { user } = useAuth();
  const adminName = user?.name || 'Admin';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingLevel, setEditingLevel] = useState(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Debounce search — avoids filtering 800+ courses on every keypress
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, filterLevel, filterDept]);

  const allDepts = useMemo(
    () => [...new Set(courses.map(c => c.department).filter(Boolean))].sort(),
    [courses]
  );

  const existingCodes = useMemo(
    () => new Set(courses.map(c => normalizeCode(c.code))),
    [courses]
  );

  const filtered = useMemo(() => courses.filter(c => {
    if (filterLevel !== 'all' && c.level !== parseInt(filterLevel)) return false;
    if (filterDept !== 'all' && c.department !== filterDept) return false;
    if (search) {
      const q = search.toLowerCase().replace(/\s+/g, '');
      const codeNorm = c.code.toLowerCase().replace(/\s+/g, '');
      if (!codeNorm.includes(q) && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  }), [courses, filterLevel, filterDept, search]);

  const PAGE_SIZE = 25;
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const handleDelete = async (id) => {
    await removeCourse(id, adminName);
    setConfirmDelete(null);
    toast.success('Course deleted successfully');
  };

  const handleSaveLevel = async (newLevel) => {
    const course = editingLevel;
    setEditingLevel(null);
    if (!course || newLevel === course.level) return;
    await updateCourse(course.id, { level: newLevel }, adminName);
    toast.success(`${course.code} moved to Level ${newLevel}`);
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
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
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
        <button className="btn btn-outline btn-sm" onClick={() => setShowSyncModal(true)}>
          <ArrowDownToLine size={14} /> Sync from Registrar
        </button>
      </div>

      {/* Course List */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Database size={16} /> Course List</div>
          <span className="text-xs text-muted">
            {filtered.length < courses.length
              ? `${filtered.length} of ${courses.length} courses`
              : `${courses.length} total`}
          </span>
        </div>
        <div className="card-content">
          <div className="data-table-wrap"><table className="data-table">
            <thead>
              <tr><th>Code</th><th>Name</th><th>Level</th><th>Department</th><th style={{ width: 76 }}></th></tr>
            </thead>
            <tbody>
              {paginated.map(c => (
                <tr key={c.id}>
                  <td className="font-medium">{c.code}</td>
                  <td>{c.name}</td>
                  <td style={{ textAlign: 'center' }}><span className={`badge badge-level-${c.level}`}>L{c.level}</span></td>
                  <td className="text-sm">{c.department}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingLevel(c)} title="Edit course level">
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(c.id)} title="Delete course">
                        <Trash2 size={14} color="var(--clr-danger)" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--clr-muted)' }}>No courses found</td></tr>
              )}
            </tbody>
          </table></div>

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

      {/* Edit Level Modal */}
      {editingLevel && (
        <EditLevelModal
          course={editingLevel}
          onSave={handleSaveLevel}
          onCancel={() => setEditingLevel(null)}
        />
      )}

      {/* Sync from Registrar Modal */}
      {showSyncModal && (
        <SyncFromRegistrarModal
          terms={academicTerms}
          importedBy={adminName}
          onClose={(didImport) => {
            setShowSyncModal(false);
            if (didImport) refreshCourses();
          }}
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

// ─── Sync from Registrar Modal ────────────────────────────────────────────────

const SyncFromRegistrarModal = ({ terms, importedBy, onClose }) => {
  const [selectedTermId, setSelectedTermId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // null = not run yet

  const selectedTerm = terms.find(t => t.id === selectedTermId || t._id === selectedTermId);

  const handleImport = async () => {
    if (!selectedTermId) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await importCourseOfferings({
        termId: selectedTerm?._serverId ?? selectedTermId,
        importedBy,
      });
      setResult({ ...data, success: true });
    } catch (err) {
      setResult({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const didImport = result?.success && (result.summary?.inserted > 0 || result.summary?.updated > 0 || result.summary?.cleaned > 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 540, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div className="card-title"><ArrowDownToLine size={16} /> Sync from Registrar</div>
          <button className="btn btn-ghost btn-sm" onClick={() => onClose(didImport)} disabled={loading}><X size={16} /></button>
        </div>

        <div className="card-content space-y-4" style={{ overflowY: 'auto' }}>

          {/* Term selection — always visible */}
          <div>
            <label className="text-sm font-medium">Academic Term</label>
            <select
              className="form-input"
              value={selectedTermId}
              onChange={e => { setSelectedTermId(e.target.value); setResult(null); }}
              disabled={loading}
            >
              <option value="">Select a term…</option>
              {terms.map(t => (
                <option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>
              ))}
            </select>
            {selectedTerm && (
              <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                Import course offerings for <strong>Term {selectedTerm.name}</strong> from the KFUPM Registrar.
                Only course name and department are updated on existing records. Level, coordinator, and status are never changed by the importer.
              </p>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0', color: 'var(--clr-muted)' }}>
              <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span className="text-sm">Fetching from registrar — this may take up to 30 seconds…</span>
            </div>
          )}

          {/* Error */}
          {result && !result.success && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px' }}>
              <p className="text-sm" style={{ color: '#dc2626', fontWeight: 500 }}>Import failed</p>
              <p className="text-xs" style={{ color: '#dc2626', marginTop: 4 }}>{result.message}</p>
            </div>
          )}

          {/* Success summary */}
          {result?.success && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Import complete — Term {result.termName}
                <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                  (registrar code: {result.registrarTermCode})
                </span>
              </p>

              {/* Counts */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${result.summary.cleaned > 0 ? 4 : 3}, 1fr)`, gap: 8 }}>
                {[
                  { label: 'Inserted', value: result.summary.inserted, color: 'var(--clr-primary)' },
                  { label: 'Updated', value: result.summary.updated, color: '#3b82f6' },
                  { label: 'Unchanged', value: result.summary.unchanged, color: 'var(--clr-muted)' },
                  ...(result.summary.cleaned > 0 ? [{ label: 'Cleaned up', value: result.summary.cleaned, color: '#ef4444' }] : []),
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'var(--clr-muted-bg)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                    <p style={{ fontSize: 22, fontWeight: 600, color }}>{value}</p>
                    <p style={{ fontSize: 11, color: 'var(--clr-muted)' }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Department changes */}
              {result.summary.departmentChanges?.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
                  <p className="text-xs font-medium" style={{ color: '#92400e', marginBottom: 6 }}>
                    Department changes ({result.summary.departmentChanges.length}) — review coordinator assignments
                  </p>
                  {result.summary.departmentChanges.map(({ code, from, to }) => (
                    <p key={code} className="text-xs" style={{ color: '#92400e' }}>
                      {code}: {from} → {to}
                    </p>
                  ))}
                </div>
              )}

              {/* Missing from import */}
              {result.summary.missingFromImport?.length > 0 && (
                <div style={{ background: 'var(--clr-muted-bg)', border: '1px solid var(--clr-border)', borderRadius: 8, padding: '10px 14px' }}>
                  <p className="text-xs font-medium" style={{ marginBottom: 6 }}>
                    Not found in this import ({result.summary.missingFromImport.length}) — may not be offered this term
                  </p>
                  <p className="text-xs text-muted" style={{ lineHeight: 1.7 }}>
                    {result.summary.missingFromImport.join(', ')}
                  </p>
                </div>
              )}

              {/* Per-department errors */}
              {result.errors?.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px' }}>
                  <p className="text-xs font-medium" style={{ color: '#dc2626', marginBottom: 6 }}>
                    Department errors ({result.errors.length})
                  </p>
                  {result.errors.map(({ dept, reason }) => (
                    <p key={dept} className="text-xs" style={{ color: '#dc2626' }}>
                      {dept}: {reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 1rem', borderTop: '1px solid var(--clr-border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          {!result ? (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => onClose(false)} disabled={loading}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleImport}
                disabled={!selectedTermId || loading}
              >
                {loading ? 'Importing…' : 'Start Import'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => onClose(didImport)}>
              {didImport ? 'Done — Refresh Course List' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Edit Level Modal ──────────────────────────────────────────────────────────

const EditLevelModal = ({ course, onSave, onCancel }) => {
  const [level, setLevel] = useState(course.level);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 380, maxWidth: '90vw' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title"><Pencil size={16} /> Edit Course Level</div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="card-content space-y-3">
          <div>
            <p className="text-sm font-medium">{course.code}</p>
            <p className="text-xs text-muted">{course.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Level</label>
            <select className="form-input" value={level} onChange={e => setLevel(parseInt(e.target.value))}>
              <option value={1}>Level 1</option>
              <option value={2}>Level 2</option>
              <option value={3}>Level 3</option>
              <option value={4}>Level 4</option>
            </select>
            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
              Phase 0 schedules Level 1, Phase 1 schedules Level 2, Phase 2 schedules Levels 3–4. Changing the level moves this course to that phase's workflow.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, paddingTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={() => onSave(level)} disabled={level === course.level}>
              Save
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

