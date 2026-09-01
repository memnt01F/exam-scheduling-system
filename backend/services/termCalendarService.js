"use strict";

/**
 * Calendar generation for the Excel exam-calendar export.
 *
 * The institutional sample workbook has Term-261's dates hardcoded in column D
 * and its holiday bands pinned to specific row numbers. None of that survives a
 * change of term, so the export generates the whole body from the term's own
 * `calendarData` instead. This module is that generator; it holds no Excel
 * knowledge, which makes it directly unit-testable.
 *
 * ---------------------------------------------------------------------------
 * DATES: two different things, deliberately kept apart
 * ---------------------------------------------------------------------------
 * A *calendar date* ("2026-10-06") is what `calendarData` stores and what the
 * spreadsheet displays. It has no timezone.
 *
 * An *instant* (`bookings.examDate`, a BSON date) is a point in time. Collapsing
 * one to a calendar date requires choosing a zone, and choosing wrong shifts
 * every exam across a day boundary. So:
 *
 *   calendarKey()  - formats a UTC-midnight Date built by THIS module. Pure UTC,
 *                    no zone involved, used only while walking the calendar.
 *   examDateKey()  - collapses a stored instant in Asia/Riyadh (+03:00, no DST).
 *
 * Both produce a plain "YYYY-MM-DD" string, and the export keys its lookup map
 * on that string. `Date` objects are never compared to each other.
 */

const {
  DAY_LETTER,
  EXCLUDED_WEEKDAY,
  SATURDAY,
  EXPORT_TZ_OFFSET_MINUTES,
} = require("../config/exportStyles");

const DAY_MS = 86400000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ------------------------------------------------------------ date keys ----

/** "YYYY-MM-DD" -> Date at UTC midnight. */
function fromKey(key) {
  if (!KEY_RE.test(String(key))) throw new Error(`Not a YYYY-MM-DD date: ${key}`);
  return new Date(`${key}T00:00:00.000Z`);
}

/** UTC-midnight Date -> "YYYY-MM-DD". For dates this module builds itself. */
function calendarKey(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * A stored instant -> the "YYYY-MM-DD" it falls on in Asia/Riyadh.
 *
 * Existing data is written at UTC midnight (2026-10-06T00:00:00.000Z), which is
 * 03:00 local and so lands on the same date either way. The shift matters for
 * anything written with a real clock time: 2026-10-06T21:00:00Z is already
 * 07-Oct in Riyadh and must appear on the 7th.
 */
function examDateKey(value) {
  // Guard the falsy cases explicitly: new Date(null) is the epoch, not an
  // invalid date, so a missing examDate would otherwise land on 1970-01-01.
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + EXPORT_TZ_OFFSET_MINUTES * 60000)
    .toISOString()
    .slice(0, 10);
}

/** Shift a date key by n whole days. */
function addDays(key, n) {
  return calendarKey(new Date(fromKey(key).getTime() + n * DAY_MS));
}

/** getUTCDay() for a date key: 0=Sun .. 6=Sat. */
function weekdayOf(key) {
  return fromKey(key).getUTCDay();
}

/** Whole days from startKey to endKey. */
function daysBetween(startKey, endKey) {
  return Math.round((fromKey(endKey) - fromKey(startKey)) / DAY_MS);
}

// -------------------------------------------------------------- calendar ---

/**
 * 1-based academic week for a date, from the term's weekStartDates.
 * Returns null when the date precedes the first known week start.
 */
function weekOf(key, sortedWeekStarts) {
  let week = null;
  for (let i = 0; i < sortedWeekStarts.length; i++) {
    if (sortedWeekStarts[i] <= key) week = i + 1;
    else break;
  }
  return week;
}

/**
 * Generate one row per exam-eligible day in [startKey, endKey].
 *
 * Fridays are omitted entirely, so a full week is six rows. Week numbers come
 * from `weekStartDates` when it covers the range - the same source the Python
 * solver uses, so the sheet and the engine agree on what "week 6" means.
 * Without it we fall back to counting, rolling the week over after Saturday
 * (the Saudi Sun-Sat week).
 *
 * A term can begin mid-week, so week 1 is often short; numbering is by calendar
 * week, never by groups of six.
 *
 * @returns {Array<{dateKey:string, dayLetter:string, week:number}>}
 */
function buildCalendar({ startKey, endKey, weekStartKeys = [] }) {
  if (startKey > endKey) return [];

  const starts = weekStartKeys.filter((k) => KEY_RE.test(String(k))).slice().sort();
  // Decide the numbering scheme ONCE, up front. Mixing the two mid-calendar
  // would produce a plausible-looking but wrong sequence.
  const useWeekStarts = starts.length > 0 && starts[0] <= startKey;

  const rows = [];
  let counted = 1;
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
    const wd = weekdayOf(key);
    if (wd === EXCLUDED_WEEKDAY) continue;
    rows.push({
      dateKey: key,
      dayLetter: DAY_LETTER[wd],
      week: useWeekStarts ? weekOf(key, starts) : counted,
    });
    if (!useWeekStarts && wd === SATURDAY) counted++;
  }
  return rows;
}

/**
 * Contiguous runs of rows sharing a week number, as sheet row numbers.
 * A run of one row gets no merge - in exceljs only a merge's top-left cell is
 * writable, so merging a single cell buys nothing and risks losing the value.
 *
 * @returns {Array<{week:number, firstRow:number, lastRow:number}>}
 */
function weekBlocks(rows, firstBodyRow) {
  const blocks = [];
  rows.forEach((row, i) => {
    const sheetRow = firstBodyRow + i;
    const last = blocks[blocks.length - 1];
    if (last && last.week === row.week && last.lastRow === sheetRow - 1) {
      last.lastRow = sheetRow;
    } else {
      blocks.push({ week: row.week, firstRow: sheetRow, lastRow: sheetRow });
    }
  });
  return blocks;
}

// ----------------------------------------------------------- sheet range ---

// The institutional sample runs from the day classes begin to the last day of
// classes, not across the whole registered term. Both boundaries exist in
// calendarData.events, but only as free text, so they are matched loosely and
// the registered term dates are the fallback whenever that match fails.
const CLASSES_BEGIN_RE = /class(?:es)?\s+begin/i;
const CLASSES_END_RE = /last\s+day\s+of\s+class(?:es)?/i;

function eventText(ev) {
  return `${ev && ev.summary ? ev.summary : ""} ${ev && ev.description ? ev.description : ""}`;
}

/** The registered term bounds - the outer limit for everything below. */
function termBounds(term) {
  const cal = (term && term.calendarData) || {};
  const startKey = cal.termStart || (term && term.startDate);
  const endKey = cal.termEnd || (term && term.endDate);
  if (!KEY_RE.test(String(startKey)) || !KEY_RE.test(String(endKey))) {
    throw new Error(
      `Term "${term && term.name}" has no usable startDate/endDate - cannot build a calendar.`
    );
  }
  return { startKey, endKey };
}

/**
 * Decide which dates the sheet spans.
 *
 * Preference is the teaching period (classes begin -> last day of classes),
 * which is what the institutional layout shows. Anything that makes that
 * unusable falls back to the registered term dates rather than guessing.
 *
 * The range is then widened to cover any booked exam that sits outside it (but
 * still inside the term), because dropping a booked exam to preserve a tidy row
 * count would be the wrong trade. Each widening is reported.
 *
 * @returns {{startKey, endKey, source, notes:string[], termStartKey, termEndKey}}
 */
function resolveSheetRange({ term, examDateKeys = [] }) {
  const bounds = termBounds(term);
  const events = ((term && term.calendarData && term.calendarData.events) || []).filter(Boolean);
  const notes = [];

  const beginEvent = events.find((e) => CLASSES_BEGIN_RE.test(eventText(e)));
  const endEvent = events.find((e) => CLASSES_END_RE.test(eventText(e)));

  let startKey = beginEvent && beginEvent.startDate;
  let endKey = endEvent && (endEvent.endDate || endEvent.startDate);
  let source = "teaching-period";

  const usable =
    KEY_RE.test(String(startKey)) &&
    KEY_RE.test(String(endKey)) &&
    startKey <= endKey &&
    startKey >= bounds.startKey &&
    endKey <= bounds.endKey;

  if (!usable) {
    source = "registered-term";
    startKey = bounds.startKey;
    endKey = bounds.endKey;
    notes.push(
      "Could not derive the teaching period from calendarData.events; " +
        `using the registered term dates ${startKey} to ${endKey} instead.`
    );
  }

  // Widen for exams that fall outside the teaching period. Exams outside the
  // term entirely are left out here and reported as anomalies by the caller.
  for (const key of examDateKeys) {
    if (!KEY_RE.test(String(key))) continue;
    if (key < bounds.startKey || key > bounds.endKey) continue;
    if (key < startKey) {
      notes.push(`Extended the sheet back to ${key} to include a booked exam.`);
      startKey = key;
    } else if (key > endKey) {
      notes.push(`Extended the sheet forward to ${key} to include a booked exam.`);
      endKey = key;
    }
  }

  return {
    startKey,
    endKey,
    source,
    notes,
    termStartKey: bounds.startKey,
    termEndKey: bounds.endKey,
  };
}

// --------------------------------------------------- exam-window counter ---

/**
 * The span column C numbers, derived from schedulingconfigs.examWindows.
 *
 * The windows are per-type inclusive academic weeks (1-based into
 * weekStartDates); the counter covers the union - the earliest startWeek to the
 * latest endWeek - clamped to the generated calendar. It counts EVERY row in
 * that span, holidays included, matching the sample. Outside it, C is blank.
 *
 * Returns null when there is no usable config, in which case column C stays
 * empty rather than being invented.
 */
function resolveCounterWindow({ schedulingConfig, weekStartKeys = [], calendarRows = [] }) {
  const windows = schedulingConfig && schedulingConfig.examWindows;
  if (!windows || typeof windows !== "object" || !calendarRows.length) return null;

  const starts = [];
  const ends = [];
  for (const w of Object.values(windows)) {
    if (!w || typeof w !== "object") continue;
    const s = Number(w.startWeek);
    const e = Number(w.endWeek);
    if (Number.isInteger(s) && s > 0) starts.push(s);
    if (Number.isInteger(e) && e > 0) ends.push(e);
  }
  if (!starts.length || !ends.length) return null;

  const firstWeek = Math.min(...starts);
  const lastWeek = Math.max(...ends);

  const sorted = weekStartKeys.filter((k) => KEY_RE.test(String(k))).slice().sort();
  if (!sorted.length) return null;

  // weekStartDates is 1-based here, matching the solver's week_of().
  const windowStart = sorted[firstWeek - 1];
  if (!windowStart) return null;
  // The window ends the day before week (lastWeek + 1) begins; if that week
  // start does not exist, the calendar's own last day is the limit.
  const afterLast = sorted[lastWeek];
  const lastRowKey = calendarRows[calendarRows.length - 1].dateKey;
  const windowEnd = afterLast ? addDays(afterLast, -1) : lastRowKey;

  const firstRowKey = calendarRows[0].dateKey;
  const startKey = windowStart > firstRowKey ? windowStart : firstRowKey;
  const endKey = windowEnd < lastRowKey ? windowEnd : lastRowKey;
  if (startKey > endKey) return null;

  return { startKey, endKey, firstWeek, lastWeek };
}

// ----------------------------------------------------------- blocked days --

/**
 * Contiguous runs of hard-blocked days, as they appear in the generated
 * calendar. `blockedDates` is a flat date->label map, so a multi-day holiday
 * arrives as separate keys; the grey band and its label need the runs.
 *
 * Runs are broken by a label change or by a gap in the calendar rows, but NOT
 * by the omitted Friday - a holiday spanning a Friday is still one band, which
 * is how the sample renders it.
 *
 * @returns {Array<{label:string, firstRow:number, lastRow:number, dateKeys:string[]}>}
 */
function blockedRuns({ calendarRows, blockedDates = {}, firstBodyRow }) {
  const runs = [];
  calendarRows.forEach((row, i) => {
    const label = blockedDates[row.dateKey];
    if (!label) return;
    const sheetRow = firstBodyRow + i;
    const last = runs[runs.length - 1];
    if (last && last.label === label && last.lastRow === sheetRow - 1) {
      last.lastRow = sheetRow;
      last.dateKeys.push(row.dateKey);
    } else {
      runs.push({
        label: String(label),
        firstRow: sheetRow,
        lastRow: sheetRow,
        dateKeys: [row.dateKey],
      });
    }
  });
  return runs;
}

module.exports = {
  fromKey,
  calendarKey,
  examDateKey,
  addDays,
  weekdayOf,
  daysBetween,
  weekOf,
  buildCalendar,
  weekBlocks,
  resolveSheetRange,
  resolveCounterWindow,
  blockedRuns,
  termBounds,
  CLASSES_BEGIN_RE,
  CLASSES_END_RE,
};
