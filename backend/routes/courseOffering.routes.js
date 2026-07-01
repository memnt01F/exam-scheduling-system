/**
 * Course offering import routes.
 *
 * POST /api/course-offerings/import
 *   Scrapes the KFUPM Registrar for the given academic term and runs a
 *   selective upsert on the Course collection.
 *
 *   Body:
 *     termId      {string}   AcademicTerm._id (required)
 *     departments {string[]} Subset of departments to scrape (optional — defaults to all)
 *     importedBy  {string}   Admin name/email for audit log (optional)
 *
 *   Response 200:
 *     { termName, registrarTermCode, summary: { inserted, updated, unchanged, departmentChanges, missingFromImport }, errors }
 *
 *   Response 400: Missing or invalid termId / term name format
 *   Response 404: AcademicTerm not found
 *   Response 500: Unexpected server error
 *
 * GET /api/course-offerings/departments
 *   Returns the full list of department codes the scraper supports.
 */

const express = require('express');
const AcademicTerm = require('../models/academicTerm.model');
const { importCourseOfferings, diagnoseOneDept, ALL_DEPARTMENTS, toRegistrarTermCode } = require('../services/courseOfferingService');

const router = express.Router();

/** GET /api/course-offerings/departments */
router.get('/departments', (_req, res) => {
  res.json({ departments: ALL_DEPARTMENTS });
});

/**
 * GET /api/course-offerings/diagnose?termId=...&dept=ICS
 * Scrapes one department and returns raw parsing detail — no DB writes.
 * Use this to inspect what the registrar is actually returning.
 */
router.get('/diagnose', async (req, res) => {
  const { termId, dept = 'ICS' } = req.query;
  if (!termId) return res.status(400).json({ message: 'termId query param required' });

  const term = await AcademicTerm.findById(termId).catch(() => null);
  if (!term) return res.status(404).json({ message: 'Academic term not found' });

  try {
    const result = await diagnoseOneDept(term.name, dept);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

/** POST /api/course-offerings/import */
router.post('/import', async (req, res) => {
  const { termId, departments, importedBy } = req.body || {};

  if (!termId) {
    return res.status(400).json({ message: 'termId is required' });
  }

  // Resolve the AcademicTerm — backend is source of truth for term name
  const term = await AcademicTerm.findById(termId).catch(() => null);
  if (!term) {
    return res.status(404).json({ message: 'Academic term not found' });
  }

  // Validate name format and derive registrar code before touching the network
  let registrarTermCode;
  try {
    registrarTermCode = toRegistrarTermCode(term.name);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const deptCodes = Array.isArray(departments) && departments.length
    ? departments
    : undefined; // undefined → service defaults to ALL_DEPARTMENTS

  try {
    const { summary, errors } = await importCourseOfferings(
      term.name,
      deptCodes,
      importedBy || 'admin'
    );

    return res.json({
      termName: term.name,
      registrarTermCode,
      summary,
      errors,
    });
  } catch (err) {
    console.error('[courseOffering] import failed:', err.message);
    return res.status(500).json({ message: 'Import failed: ' + err.message });
  }
});

module.exports = router;
