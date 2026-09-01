"use strict";

/**
 * Style + layout constants for the Excel exam-calendar export.
 *
 * Every colour, font and width here was READ OUT OF
 *   assets/templates/ExamTableTemplate.flat.xlsx
 * rather than transcribed from a screenshot. `scripts/verifyExportTemplate.js`
 * re-reads the template and fails if these constants drift away from it, so a
 * future edit to the template cannot silently change what we generate.
 *
 * The template is a style donor only: it supplies row 1 and the column
 * dimensions, and everything from row 2 down is generated from term data
 * (see services/termCalendarService.js). That is what makes the export
 * term-agnostic instead of a fixed 261 grid.
 */

// ---------------------------------------------------------------- fonts ----
// `family: 2` is what Excel wrote; keeping it makes the output byte-comparable
// to the template rather than merely similar.
const FONT = { name: "Calibri", family: 2, size: 8 };
const FONT_BOLD = { ...FONT, bold: true };

// exceljs spells the vertical centre "middle"; Excel serialises it "center".
const CENTER = { horizontal: "center", vertical: "middle" };
const CENTER_WRAP = { ...CENTER, wrapText: true };

const BORDER_THIN = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

// The backslashes escape the hyphens so Excel treats them as literals rather
// than as date separators. exceljs strips them again on read, so tests compare
// against the template's own cell rather than against this literal.
const DATE_FMT = "[$-409]d\-mmm\-yyyy;@";

// ---------------------------------------------------------------- fills ----
const FILL = {
  HEADER: "FFEEECE1", // row 1 band
  CLOSED: "FFD9D9D9", // hard-blocked day: holiday / break. The grey band.
  WHITE: "FFFFFFFF",  // exam-window counter column background
  EVENT: "FFDBEEF4",  // soft-blocked day, column AG
};

/** exceljs solid-fill descriptor for an ARGB string. */
const solidFill = (argb) => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
  bgColor: { argb },
});

// --------------------------------------------------------------- layout ----
const COL = {
  WEEK: 1,        // A - week number, merged vertically across the week
  DAY: 2,         // B - day letter
  COUNTER: 3,     // C - exam-window day counter
  DATE: 4,        // D - the date
  DEPT_FIRST: 5,  // E - first department column
  DEPT_LAST: 32,  // AF - last department column
  EVENTS: 33,     // AG - "Building 54 Events (Unavailable)". Never a department.
};

const HEADER_ROW = 1;
const FIRST_BODY_ROW = 2;

// Row height used when a row has no wrapped content (template defaultRowHeight).
const BASE_ROW_HEIGHT = 10.5;
const MAX_ROW_HEIGHT = 160;

// ------------------------------------------------------------- calendar ----
// Keyed by getUTCDay(). Friday (5) is absent because Friday never hosts an exam
// and is omitted from the sheet entirely - six rows per week, not seven.
const DAY_LETTER = { 0: "U", 1: "M", 2: "T", 3: "W", 4: "R", 6: "S" };
const EXCLUDED_WEEKDAY = 5; // Friday
const SATURDAY = 6;         // the week rolls over after Saturday (Sun-Sat week)

// ------------------------------------------------------------ exam data ----
/**
 * bookings.examType -> the suffix written in the cell, e.g. "EE201 (M1)".
 * These are the four values the Booking model's enum allows. An examType that
 * is not in this map FAILS the export rather than writing a bare course code -
 * a silently untagged cell is indistinguishable from a data-entry error.
 */
const EXAM_TYPE_SUFFIX = {
  "Major 1": "M1",
  "Major 2": "M2",
  "Major 3": "M3",
  Mid: "Mid",
};

/** Sort order within a multi-exam cell: type first, then course code. */
const EXAM_TYPE_ORDER = ["Major 1", "Major 2", "Major 3", "Mid"];

/**
 * Statuses that are NOT exported. Mirrors the solver's own
 * config.IGNORED_STATUSES so the spreadsheet and the engine agree on what
 * counts as a real booking. Everything else (pending, confirmed, approved)
 * is exported - note that phase-1 exams are all still "pending", so filtering
 * on "confirmed" alone would export an empty phase-1 grid.
 */
const IGNORED_STATUSES = ["cancelled", "rejected"];

const CELL_JOIN = " | ";

/**
 * Asia/Riyadh, as a fixed offset. Saudi Arabia has never observed DST, so a
 * constant +03:00 is exact rather than an approximation. This is the single
 * zone in which a stored instant is collapsed to a calendar date - see
 * termCalendarService.examDateKey.
 */
const EXPORT_TZ_OFFSET_MINUTES = 180;

module.exports = {
  FONT,
  FONT_BOLD,
  CENTER,
  CENTER_WRAP,
  BORDER_THIN,
  DATE_FMT,
  FILL,
  solidFill,
  COL,
  HEADER_ROW,
  FIRST_BODY_ROW,
  BASE_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  DAY_LETTER,
  EXCLUDED_WEEKDAY,
  SATURDAY,
  EXAM_TYPE_SUFFIX,
  EXAM_TYPE_ORDER,
  IGNORED_STATUSES,
  CELL_JOIN,
  EXPORT_TZ_OFFSET_MINUTES,
};
