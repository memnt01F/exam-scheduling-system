"use strict";

/**
 * courses.department  ->  exact template header text (row 1, columns E..AF).
 *
 * This map is deliberately EMPTY. All 28 values returned by
 *   db.courses.distinct("department")
 * already match the 28 template headers verbatim, so every exam routes by
 * normalised exact match (see scheduleExportService.buildDeptColumnIndex).
 *
 * Add an entry only when a new department name appears in `courses` that does
 * not match a header. Do NOT fuzzy-match: routing an exam into a
 * wrong-but-similar column is worse than reporting it unmapped, so anything
 * unresolved is skipped and listed on the Export Log sheet instead.
 *
 *   'Architectural Engineering': 'Arch. Engg & Construction Mgt.',
 */
module.exports = {};
