/**
 * Enrollment routes.
 *
 * GET  /api/enrollments/stats
 *   Returns enrollment counts grouped by termId.
 *   Response: { stats: [{ termId, count, lastUpdated }] }
 *
 * POST /api/enrollments/upload   (multipart/form-data)
 *   Fields:  termId (string), importedBy (string, optional)
 *   File:    file (.xlsx / .xls)
 *   Masks student IDs with SHA-256 (truncated to 7 digits) before storage.
 *   Replaces all existing enrollments for the given term.
 *   Lab courses (code ending in _LAB) never appear in the file, so their
 *   rosters are re-copied from their parent course afterwards and the
 *   conflict cache is rebuilt.
 *   Response: { termName, termId, inserted, replaced, labSync, conflictsRebuilt }
 */

const express = require('express');
const multer  = require('multer');
const XLSX    = require('xlsx');
const AcademicTerm = require('../models/academicTerm.model');
const Enrollment   = require('../models/enrollment.model');
const AuditLog     = require('../models/auditLog.model');
const { hashStudentId } = require('../utils/hashStudentId');
const { syncLabEnrollments } = require('../services/labEnrollmentService');
const { rebuildCourseConflicts } = require('../services/conflictsService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return undefined;
}

/** GET /api/enrollments/stats */
router.get('/stats', async (_req, res) => {
  try {
    const stats = await Enrollment.aggregate([
      {
        $group: {
          _id: '$termId',
          count: { $sum: 1 },
          lastUpdated: { $max: '$updatedAt' },
        },
      },
    ]);
    return res.json({
      stats: stats.map(s => ({
        termId: s._id,
        count: s.count,
        lastUpdated: s.lastUpdated,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/** POST /api/enrollments/upload */
router.post('/upload', upload.single('file'), async (req, res) => {
  const { termId, importedBy } = req.body || {};

  if (!termId) return res.status(400).json({ message: 'termId is required' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const ext = (req.file.originalname || '').toLowerCase();
  if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
    return res.status(400).json({ message: 'Only .xlsx and .xls files are accepted' });
  }

  const term = await AcademicTerm.findById(termId).catch(() => null);
  if (!term) return res.status(404).json({ message: 'Academic term not found' });

  // Parse xlsx from memory buffer — read ALL sheets and merge rows
  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    rows = wb.SheetNames.flatMap(name =>
      XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null })
    );
  } catch (err) {
    return res.status(400).json({ message: 'Failed to parse Excel file: ' + err.message });
  }

  // Build enrollment documents with masked student IDs
  const docs = [];
  let skipped = 0;
  for (const row of rows) {
    const rawId = pick(row, ['studentId', 'StudentID', 'Student ID', 'student_id', 'id', 'ID', 'ID#', 'Id#']);

    let courseCode = pick(row, ['courseCode', 'CourseCode', 'Course Code', 'course_code', 'course', 'Course']);
    if (!courseCode) {
      const subj = pick(row, ['SUBJ', 'Subj', 'subj', 'Subject', 'subject']);
      const num  = pick(row, ['COURSE', 'Course', 'course', 'CourseNumber', 'Course Number', 'course_number']);
      if (subj && num !== undefined && num !== null) {
        courseCode = `${String(subj).trim()}${String(num).trim()}`;
      }
    }

    if (!rawId || !courseCode) { skipped++; continue; }

    let hashedId;
    try {
      hashedId = hashStudentId(rawId);
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }

    docs.push({
      studentId: hashedId,
      courseCode: String(courseCode).replace(/\s+/g, '').toUpperCase(),
      courseName: pick(row, ['courseName', 'CourseName', 'Course Name']),
      level: pick(row, ['level', 'Level']),
      section: pick(row, ['section', 'Section', 'SECTION', 'SECTION #', 'Section #']),
      termId: term._id,
    });
  }

  if (docs.length === 0) {
    return res.status(400).json({
      message: `No valid enrollment rows found. ${skipped} rows were skipped — check that the file has columns named: studentId (or ID), and courseCode (or SUBJ + COURSE).`
    });
  }

  // Count existing before replacing
  const replaced = await Enrollment.countDocuments({ termId: term._id });

  // Replace enrollments for this term
  await Enrollment.deleteMany({ termId: term._id });

  const BATCH = 5000;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    // Count what actually landed, not what was attempted — with ordered:false a
    // partially-failed batch would otherwise be reported as a full success.
    const written = await Enrollment.insertMany(docs.slice(i, i + BATCH), { ordered: false });
    inserted += written.length;
  }

  // The deleteMany above wiped every lab roster too, so the copy has to run
  // after the insert. Failures are reported, never fatal — the uploaded
  // enrollments are already saved by this point.
  let labSync = [];
  let labSyncError = null;
  try {
    labSync = await syncLabEnrollments({ termId: term._id });
  } catch (err) {
    labSyncError = err.message;
  }

  // Rebuild the courseconflicts cache: enrollments just changed, and nothing
  // else refreshes it (the scheduler only auto-builds when a term has none).
  const conflictsRebuilt = await rebuildCourseConflicts(String(term._id));

  const labsCopied = labSync.reduce((sum, l) => sum + l.copied, 0);
  const labsSkipped = labSync.filter(l => l.skipped);

  await AuditLog.create({
    action: 'ENROLLMENT_UPLOAD',
    user: importedBy || 'admin',
    role: 'admin',
    details: `Uploaded ${inserted} enrollments for ${term.name}`
      + `${replaced > 0 ? ` (replaced ${replaced} existing)` : ''}`
      + `${labSync.length ? `; synced ${labsCopied} lab enrollment(s) across ${labSync.length} lab course(s)` : ''}`
      + `${labsSkipped.length ? `; ${labsSkipped.length} lab(s) skipped` : ''}`,
    metadata: {
      termId: term._id, termName: term.name, inserted, replaced,
      labSync, labSyncError,
      conflictsRebuilt: { ok: conflictsRebuilt.ok, message: conflictsRebuilt.message },
    },
  });

  return res.json({
    termName: term.name, termId: term._id, inserted, replaced, skipped, total: rows.length,
    labSync, labSyncError,
    conflictsRebuilt: { ok: conflictsRebuilt.ok, message: conflictsRebuilt.message },
  });
});

module.exports = router;
