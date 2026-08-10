/**
 * PreferenceImport.jsx
 *
 * Two buttons for the Scheduling Management top bar:
 *   • Download Template — generates the Step-1 Excel template (headers + examples).
 *   • Import            — upload an Excel/CSV file of course preferences and write
 *                         them into the CoursePreference collection for the SELECTED
 *                         term. Courses that already have a preference for that term
 *                         are skipped — existing data is never overwritten.
 *
 * The Import button is disabled until a term is selected. Parsing is done in the
 * browser with SheetJS (loaded on demand, same pattern as ReferenceData.jsx); the
 * authoritative "skip existing" check also runs server-side in the import route.
 */
import { useRef, useState } from 'react';
import {
  Upload, Download, FileSpreadsheet, X, AlertTriangle, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext.jsx';
import { importPreferences } from '../../services/api.js';

/* ── Downloadable template: one formatted header row, no example data ──
 * Each column has a black main label and (optionally) a red "how to fill" hint,
 * mirroring the hand-made spreadsheet. `main`/`hint` are also what the importer's
 * fuzzy column matcher keys on, so they must keep the same leading words. */
const TEMPLATE_HEADER = [
  { width: 10, main: 'Subj' },
  { width: 14, main: 'Course Code' },
  { width: 22, main: 'Type', hint: '(1 = Midterm, 2 = Majors)' },
  { width: 22, main: 'Major 1 - Preferred Week', hint: '(Example: 7,8)' },
  { width: 22, main: 'Major 2 - Preferred Week', hint: '(Example: 11,12)' },
  { width: 22, main: 'Midterm - Preferred Week', hint: '(Example: 8, 9)' },
  { width: 20, main: 'Preferred Days', hint: 'Format: (U,M,T,W,R,S)' },
  { width: 20, main: 'Unpreferred Days', hint: 'Format: (U,M,T,W,R,S)' },
  { width: 44, redOnly: 'Comments' },
];

/* KFUPM day-letter → stored 3-letter day. */
const DAY_LETTER = { U: 'Sun', M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', S: 'Sat' };
const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Sat'];

/* ── SheetJS loader (identical CDN to ReferenceData.jsx) ── */
function ensureXlsx() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('Failed to load Excel parser library'));
    document.head.appendChild(script);
  });
}

async function parseXlsx(file) {
  const XLSX = await ensureXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/* ExcelJS loader — used only to generate a nicely styled template (rich text +
 * column widths), which SheetJS's free build cannot produce. */
function ensureExcelJs() {
  return new Promise((resolve, reject) => {
    if (window.ExcelJS) { resolve(window.ExcelJS); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => reject(new Error('Failed to load Excel writer library'));
    document.head.appendChild(script);
  });
}

/* Quote-aware CSV parser (fields may contain commas, e.g. the Comments column). */
function parseCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lines = String(e.target.result).split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { resolve([]); return; }
        const splitLine = (line) => {
          const out = []; let cur = ''; let q = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
            } else if (ch === ',' && !q) { out.push(cur); cur = ''; }
            else cur += ch;
          }
          out.push(cur);
          return out.map(s => s.trim());
        };
        const headers = splitLine(lines[0]);
        const rows = lines.slice(1).map(line => {
          const cols = splitLine(line);
          const obj = {};
          headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
          return obj;
        });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/* Match the file's header row to our logical columns (order-independent, fuzzy). */
function resolveColumns(headers) {
  const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
  const find = (pred) => headers.find(h => pred(norm(h)));
  return {
    subj:        find(n => n.startsWith('subj') || n.includes('subject')),
    code:        find(n => n.startsWith('coursecode') || n.startsWith('courseno') || n === 'code' || n === 'course'),
    type:        find(n => n.startsWith('type')),
    major1:      find(n => n.startsWith('major1')),
    major2:      find(n => n.startsWith('major2')),
    midterm:     find(n => n.startsWith('midterm')),
    unpreferred: find(n => n.startsWith('unpreferred')),
    preferred:   find(n => n.startsWith('preferred')),
    comments:    find(n => n.startsWith('comment')),
  };
}

/* "6, 7" → [6,7] · 7 → [7] · "Major3: 14" → [14] */
function parseWeeks(cell) {
  if (cell == null || cell === '') return [];
  let s = String(cell);
  if (s.includes(':')) s = s.slice(s.lastIndexOf(':') + 1); // drop "Major3:" style labels
  const nums = (s.match(/\d+/g) || []).map(Number).filter(n => n >= 1 && n <= 20);
  return [...new Set(nums)].sort((a, b) => a - b);
}

/* "M,T,W" → [Mon,Tue,Wed] · "Tuesday" → [Tue] · "R,S" → [Thu,Sat] */
function parseDays(cell) {
  if (cell == null || cell === '') return [];
  const tokens = String(cell).split(/[^a-zA-Z]+/).map(t => t.trim()).filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    const low = tok.toLowerCase();
    let day = null;
    if (low.startsWith('sun')) day = 'Sun';
    else if (low.startsWith('mon')) day = 'Mon';
    else if (low.startsWith('tue') || low.startsWith('tus')) day = 'Tue';
    else if (low.startsWith('wed')) day = 'Wed';
    else if (low.startsWith('thu') || low.startsWith('thr')) day = 'Thu';
    else if (low.startsWith('sat')) day = 'Sat';
    else if (tok.length === 1) day = DAY_LETTER[tok.toUpperCase()] || null;
    if (day && !out.includes(day)) out.push(day);
  }
  return out.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

/* Map the Type column (and, when blank, the filled week columns) to examType. */
function mapExamType(typeCell, weeks) {
  const t = String(typeCell ?? '').trim();
  if (t === '1' || /midterm/i.test(t)) return 'Midterm';
  if (t === '3' || /three/i.test(t)) return 'Three Majors';
  if (t === '2' || /major/i.test(t)) return 'Two Majors';
  // Blank type → infer from which week columns are filled.
  const hasMajor = weeks.major1.length > 0 || weeks.major2.length > 0;
  const hasMid = weeks.midterm.length > 0;
  if (hasMajor && hasMid) return 'Three Majors';
  if (hasMajor) return 'Two Majors';
  if (hasMid) return 'Midterm';
  return null;
}

/* One spreadsheet row → one preference payload (null = skip this row). */
function rowToPreference(row, cols) {
  const subj = String(cols.subj ? row[cols.subj] : '').trim();
  const codeRaw = String(cols.code ? row[cols.code] : '').trim();
  const courseCode = (subj + codeRaw).toUpperCase().replace(/\s+/g, '');
  if (!courseCode || !/\d/.test(courseCode)) return null; // blank / non-course row

  const weeks = {
    major1: parseWeeks(cols.major1 ? row[cols.major1] : ''),
    major2: parseWeeks(cols.major2 ? row[cols.major2] : ''),
    midterm: parseWeeks(cols.midterm ? row[cols.midterm] : ''),
  };

  return {
    courseCode,
    examType: mapExamType(cols.type ? row[cols.type] : '', weeks),
    major1Weeks: weeks.major1,
    major2Weeks: weeks.major2,
    midtermWeeks: weeks.midterm,
    preferredDays: parseDays(cols.preferred ? row[cols.preferred] : ''),
    unpreferredDays: parseDays(cols.unpreferred ? row[cols.unpreferred] : ''),
    comments: String(cols.comments ? row[cols.comments] : '').trim(),
  };
}

async function downloadTemplate() {
  try {
    const ExcelJS = await ensureExcelJs();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Step1', { views: [{ state: 'frozen', ySplit: 1 }] });

    // Column widths — the "spaces for each column".
    ws.columns = TEMPLATE_HEADER.map(c => ({ width: c.width }));

    // Single header row: black main label + red hint (rich text), no data rows.
    const black = { bold: true, color: { argb: 'FF000000' }, name: 'Calibri', size: 11 };
    const red   = { bold: true, color: { argb: 'FFFF0000' }, name: 'Calibri', size: 10 };

    const headerRow = ws.getRow(1);
    TEMPLATE_HEADER.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      if (c.redOnly) {
        cell.value = { richText: [{ text: c.redOnly, font: { ...red, size: 11 } }] };
      } else {
        cell.value = {
          richText: [
            { text: c.main, font: black },
            ...(c.hint ? [{ text: '\n' + c.hint, font: red }] : []),
          ],
        };
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFBFBFBF' } },
        left:   { style: 'thin', color: { argb: 'FFBFBFBF' } },
        bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
        right:  { style: 'thin', color: { argb: 'FFBFBFBF' } },
      };
    });
    headerRow.height = 40;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CoursePreferences-Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err.message || 'Failed to generate template');
  }
}

/* ── Component ── */
const PreferenceImport = ({ termId, termName, existingCodes, onImported }) => {
  const { user } = useAuth();
  const importedBy = user?.name || 'Admin';
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { fileName, toImport, skipped }

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!termId) { toast.error('Select a term before importing'); return; }

    setBusy(true);
    try {
      const rows = /\.(xlsx|xls)$/i.test(file.name) ? await parseXlsx(file) : await parseCsv(file);
      if (!rows.length) { toast.error('No data found in the file'); return; }

      const cols = resolveColumns(Object.keys(rows[0]));
      if (!cols.subj && !cols.code) {
        toast.error('Could not find "Subj" / "Course Code" columns. Use Download Template for the expected format.');
        return;
      }

      const parsed = rows.map(r => rowToPreference(r, cols)).filter(Boolean);
      if (!parsed.length) { toast.error('No valid course rows found in the file'); return; }

      // De-duplicate within the file (keep first occurrence).
      const seen = new Set();
      const unique = parsed.filter(p => (seen.has(p.courseCode) ? false : seen.add(p.courseCode)));

      const existing = existingCodes || new Set();
      const toImport = unique.filter(p => !existing.has(p.courseCode));
      const skipped  = unique.filter(p =>  existing.has(p.courseCode));
      setPreview({ fileName: file.name, toImport, skipped });
    } catch (err) {
      toast.error(err.message || 'Failed to parse file');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    // Send everything; the backend re-checks and skips existing courses authoritatively.
    const rows = [...preview.toImport, ...preview.skipped];
    setPreview(null);
    setBusy(true);
    try {
      const res = await importPreferences({ termId, importedBy, rows });
      const ins = res?.inserted ?? 0;
      const skp = res?.skipped ?? 0;
      if (ins > 0) {
        toast.success(`Imported ${ins} course preference(s)${skp ? ` · ${skp} skipped (already exist)` : ''}`);
      } else {
        toast.info(`Nothing imported — ${skp} course(s) already exist for this term`);
      }
      onImported?.();
    } catch (err) {
      toast.error(err.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="btn btn-outline btn-sm"
        onClick={downloadTemplate}
        style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
      >
        <Download size={14} /> Download Template
      </button>

      <button
        className="btn btn-outline btn-sm"
        onClick={() => fileRef.current?.click()}
        disabled={!termId || busy}
        title={!termId ? 'Select a term first' : 'Import course preferences from Excel or CSV'}
        style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
      >
        {busy
          ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
          : <Upload size={14} />}
        Import
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      {preview && (
        <PreferenceImportPreview
          preview={preview}
          termName={termName}
          onCancel={() => setPreview(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
};

/* ── Preview modal ── */
const fmt = (arr) => (arr && arr.length ? arr.join(', ') : '—');

const PreferenceImportPreview = ({ preview, termName, onCancel, onConfirm }) => {
  const { fileName, toImport, skipped } = preview;
  const [tab, setTab] = useState('new');
  const rows = tab === 'new' ? toImport : skipped;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 860, maxWidth: '96vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div className="card-title"><FileSpreadsheet size={16} /> Import Preferences — {fileName}</div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><X size={16} /></button>
        </div>

        <div style={{ padding: '0 1rem', flexShrink: 0 }}>
          <p className="text-xs text-muted" style={{ margin: '4px 0 12px' }}>
            {termName ? <>Importing into <strong>{termName}</strong>. </> : null}
            Courses that already have a preference for this term are skipped — existing data is never overwritten.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--clr-muted-bg)', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 22, fontWeight: 500, color: 'var(--clr-primary)' }}>{toImport.length}</p>
              <p style={{ fontSize: 12, color: 'var(--clr-muted)' }}>New — will be imported</p>
            </div>
            <div style={{ background: 'var(--clr-muted-bg)', borderRadius: 8, padding: '10px 14px' }}>
              <p style={{ fontSize: 22, fontWeight: 500, color: 'var(--clr-warning, #e68a00)' }}>{skipped.length}</p>
              <p style={{ fontSize: 12, color: 'var(--clr-muted)' }}>Already exist — will be skipped</p>
            </div>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--clr-border)' }}>
            {['new', 'skip'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '6px 16px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
                  fontWeight: tab === t ? 500 : 400,
                  borderBottom: tab === t ? '2px solid var(--clr-primary)' : '2px solid transparent',
                  color: tab === t ? 'var(--clr-primary)' : 'var(--clr-muted)',
                }}
              >
                {t === 'new' ? `To Import (${toImport.length})` : `Skipped (${skipped.length})`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 1rem' }}>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Course</th><th>Exam Type</th><th>Major 1</th><th>Major 2</th>
                <th>Midterm</th><th>Preferred</th><th>Unpreferred</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i}>
                  <td className="font-medium">{p.courseCode}</td>
                  <td className="text-sm">{p.examType || '—'}</td>
                  <td className="text-sm">{fmt(p.major1Weeks)}</td>
                  <td className="text-sm">{fmt(p.major2Weeks)}</td>
                  <td className="text-sm">{fmt(p.midtermWeeks)}</td>
                  <td className="text-sm">{fmt(p.preferredDays)}</td>
                  <td className="text-sm">{fmt(p.unpreferredDays)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 16, color: 'var(--clr-muted)' }}>None</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 1rem', borderTop: '1px solid var(--clr-border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          {toImport.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--clr-warning, #e68a00)', fontSize: 13, marginRight: 'auto' }}>
              <AlertTriangle size={14} /> All courses already exist — nothing to import
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--clr-primary)', fontSize: 13, marginRight: 'auto' }}>
              <CheckCircle2 size={14} /> {toImport.length} course(s) ready to import
            </div>
          )}
          <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={toImport.length === 0}>
            Import {toImport.length} Course(s)
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreferenceImport;
