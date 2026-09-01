"use strict";

/**
 * Builds the "Extract to Excel" workbook for the Schedule Management page.
 *
 * ---------------------------------------------------------------------------
 * Template as style donor, body generated
 * ---------------------------------------------------------------------------
 * assets/templates/ExamTableTemplate.flat.xlsx supplies row 1, the column
 * dimensions and the sheet/print settings. Everything from row 2 down is
 * generated from the term's calendarData, because the template's dates, grey
 * holiday bands and merged label bands are all pinned to Term-261 row numbers
 * and would be wrong for any other term.
 *
 * The template is opened READ-ONLY from a cached buffer and is never written
 * back to - one bug there would corrupt the master for every future export.
 *
 * Rather than deleting rows 2..n out of the loaded sheet (splicing a sheet that
 * still holds 20 merged ranges is how you get a silently corrupt workbook), we
 * copy row 1 and the column widths onto a fresh sheet. The template body holds
 * no exam data - only the holiday labels, which we regenerate - so nothing is
 * lost, and the styling is still sourced from the real file rather than retyped.
 */

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");

const styles = require("../config/exportStyles");
const departmentAliases = require("../config/departmentAliases");
const cal = require("./termCalendarService");

const {
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
  EXAM_TYPE_SUFFIX,
  EXAM_TYPE_ORDER,
  IGNORED_STATUSES,
  CELL_JOIN,
  EXPORT_TZ_OFFSET_MINUTES,
} = styles;

// Resolved from the module location, not process.cwd() - a relative path breaks
// the moment the app runs under a process manager or from another directory.
const TEMPLATE_PATH = path.join(__dirname, "..", "assets", "templates", "ExamTableTemplate.flat.xlsx");

/** Excel's day 0. Dates from 1900-03-01 on need no leap-bug correction. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

// --------------------------------------------------------------- errors ----

class ExportError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "ExportError";
  }
}

// ------------------------------------------------------------- template ----

let templateBuffer = null;

/** Read (and cache) the template bytes. Never written back. */
function readTemplateBuffer() {
  if (!templateBuffer) templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  return templateBuffer;
}

/**
 * Everything the template donates: row 1 (values + styles), the column widths,
 * and the sheet/print settings. Parsed per call from the cached buffer so a
 * request can never mutate shared state.
 */
async function loadDonor() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readTemplateBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new ExportError(500, "Export template contains no worksheet.");

  // Stop at AG. The template also carries widths for AH/AI, but they hold no
  // calendar data, and including them pushes the sheet's dimension out past the
  // grid for no benefit.
  const lastCol = COL.EVENTS;
  const columns = [];
  for (let c = 1; c <= lastCol; c++) columns.push({ width: ws.getColumn(c).width });

  const headerCells = [];
  for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(HEADER_ROW, c);
    headerCells.push({
      col: c,
      value: cell.value,
      // Deep-clone so the generated sheet shares no style objects with the
      // template workbook we are about to discard.
      style: JSON.parse(JSON.stringify(cell.style || {})),
    });
  }

  // Copy ONLY the settings the template's XML actually carries.
  //
  // exceljs invents values for absent attributes when it reads a sheet
  // (horizontalDpi/verticalDpi become 4294967295, plus copies, firstPageNumber,
  // useFirstPageNumber...) and then writes them all back out. Excel rejects
  // that output - "We found a problem with some content" - and none of it is
  // part of the layout we are reproducing. The template's real pageSetup is
  // just: orientation, paperSize, scale, fitToPage and the margins.
  const view = (ws.views && ws.views[0]) || {};
  const page = ws.pageSetup || {};
  return {
    headerCells,
    columns,
    // The template's stored activeCell/topLeftCell are wherever its author last
    // clicked; carrying them over would scroll every export to a stale spot.
    view: {
      showGridLines: view.showGridLines !== false,
      zoomScale: view.zoomScale || 100,
      zoomScaleNormal: view.zoomScaleNormal || view.zoomScale || 100,
    },
    properties: {
      defaultRowHeight: ws.properties && ws.properties.defaultRowHeight,
      defaultColWidth: ws.properties && ws.properties.defaultColWidth,
    },
    pageSetup: {
      orientation: page.orientation,
      paperSize: page.paperSize,
      scale: page.scale,
      fitToPage: page.fitToPage,
      margins: page.margins,
    },
  };
}

/**
 * Boot-time sanity check. Failing at startup with a clear message beats failing
 * on a user's click. Returns a report instead of throwing so a missing template
 * degrades this one feature rather than taking the whole API down.
 */
async function verifyTemplate() {
  try {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return { ok: false, message: `Export template not found at ${TEMPLATE_PATH}` };
    }
    const donor = await loadDonor();
    const deptCount = buildDeptColumnIndex(donor.headerCells).size;
    if (deptCount === 0) {
      return { ok: false, message: "Export template row 1 has no department headers in E..AF." };
    }
    const eventsHeader = donor.headerCells.find((h) => h.col === COL.EVENTS);
    return {
      ok: true,
      message: `Export template OK - ${deptCount} department columns, events column "${eventsHeader && eventsHeader.value}".`,
      departmentCount: deptCount,
    };
  } catch (err) {
    return { ok: false, message: `Export template is unreadable: ${err.message}` };
  }
}

// ---------------------------------------------------- department routing ----

const norm = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Normalised template header -> column number, read from row 1 at runtime
 * rather than hardcoded, so editing a header cannot silently misroute data.
 * Stops before AG: "Building 54 Events (Unavailable)" is not a department.
 */
function buildDeptColumnIndex(headerCells) {
  const index = new Map();
  for (const h of headerCells) {
    if (h.col < COL.DEPT_FIRST || h.col > COL.DEPT_LAST) continue;
    const label = norm(h.value);
    if (label) index.set(label, h.col);
  }
  return index;
}

/** Resolve a courses.department value to a column, via exact match then alias. */
function resolveDeptColumn(department, deptIndex) {
  const direct = deptIndex.get(norm(department));
  if (direct) return direct;
  const alias = departmentAliases[String(department || "").trim()];
  if (alias) {
    const viaAlias = deptIndex.get(norm(alias));
    if (viaAlias) return viaAlias;
  }
  return null;
}

// ------------------------------------------------------------ data access --

function resolveDb(db) {
  const conn = db || (mongoose.connection && mongoose.connection.db);
  if (!conn) throw new ExportError(500, "No database connection available.");
  return conn;
}

/** Look the term up by _id, falling back to its name ("261"). */
async function loadTerm(db, termRef) {
  const ref = String(termRef || "").trim();
  if (!ref) throw new ExportError(400, "termId is required.");

  const or = [{ name: ref }];
  if (mongoose.Types.ObjectId.isValid(ref) && String(new mongoose.Types.ObjectId(ref)) === ref) {
    or.unshift({ _id: new mongoose.Types.ObjectId(ref) });
  }
  const term = await db.collection("academicterms").findOne({ $or: or });
  if (!term) throw new ExportError(404, `Term "${ref}" not found.`);
  if (!term.calendarData || !term.calendarData.weekStartDates) {
    // The solver refuses to run without this too; a sheet built without it
    // would carry invented week numbers.
    throw new ExportError(404, `Term "${term.name}" has no calendarData.weekStartDates - cannot build the calendar.`);
  }
  return term;
}

async function loadSchedulingConfig(db) {
  return db.collection("schedulingconfigs").findOne({ scope: "global" });
}

/**
 * Every booked exam in the term, with the owning course's department joined on.
 * `department` lives on `courses`, not on the booking, so the join is what
 * decides the column.
 *
 * Deliberately NOT filtered by phase. `phaseNumber` turned out not to be
 * reliable enough to gate an export on: a booking sitting in the wrong phase
 * would silently vanish from the sheet, and a missing exam is a far worse
 * outcome than an extra one. The only exclusion is status.
 *
 * `status` covers deletion too - "delete" in the UI is a soft-cancel that sets
 * status to "cancelled" (see routes/booking.routes.js), and the one hard-delete
 * path removes the document outright, so it cannot show up here either.
 */
async function loadExams(db, { termId }) {
  return db
    .collection("bookings")
    .aggregate([
      {
        $match: {
          termId: termId,
          status: { $nin: IGNORED_STATUSES },
        },
      },
      {
        $lookup: {
          from: "courses",
          localField: "courseCode",
          foreignField: "code",
          as: "course",
        },
      },
      { $unwind: { path: "$course", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          courseCode: 1,
          examType: 1,
          examDate: 1,
          phaseNumber: 1,
          status: 1,
          department: "$course.department",
        },
      },
    ])
    .toArray();
}

/**
 * Why the exported count differs from the term's booking total.
 *
 * Without this, a log line reading "180/180" cannot distinguish "everything was
 * written" from "we silently lost some" - both numbers are post-filter. These
 * counts make the whole term reconcile:
 *   totalInTerm = written + skipped + ignoredStatus
 */
async function loadExamCounts(db, { termId }) {
  const col = db.collection("bookings");
  const [totalInTerm, ignoredStatus] = await Promise.all([
    col.countDocuments({ termId }),
    col.countDocuments({ termId, status: { $in: IGNORED_STATUSES } }),
  ]);
  return { totalInTerm, ignoredStatus };
}

// ------------------------------------------------------------- formatting --

/** "2026-10-06" -> the Excel serial the template itself stores in column D. */
function toSerial(dateKey) {
  return Math.round((cal.fromKey(dateKey) - EXCEL_EPOCH_UTC) / DAY_MS);
}

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
function sheetName(termName) {
  const safe = `Term-${String(termName || "").trim()}`.replace(/[:\\/?*[\]]/g, "-");
  return safe.slice(0, 31) || "Term";
}

/** Local (Riyadh) wall-clock parts, for the filename stamp. */
function stampParts(now) {
  const shifted = new Date(now.getTime() + EXPORT_TZ_OFFSET_MINUTES * 60000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16).replace(":", "") };
}

function buildFilename({ termName, now }) {
  const { date, time } = stampParts(now);
  const term = `Term-${String(termName || "").trim()}`;
  return `Exam_Schedule_${term}_All-Bookings_${date}_${time}.xlsx`
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_");
}

/**
 * Approximate the wrapped height of a row. Excel does not auto-fit on open when
 * a height is absent, and the busiest cells hold ten-plus exams, so an explicit
 * height is the difference between legible and clipped. Deterministic, so
 * re-exporting identical data still yields an identical file.
 */
function estimateRowHeight(entries) {
  let lines = 1;
  for (const { text, width } of entries) {
    const perLine = Math.max(1, Math.floor((width || 8.43) - 1));
    lines = Math.max(lines, Math.ceil(String(text).length / perLine));
  }
  return Math.min(MAX_ROW_HEIGHT, Math.max(BASE_ROW_HEIGHT, lines * BASE_ROW_HEIGHT));
}

// ------------------------------------------------------------ the export ---

/**
 * @param {object}  opts
 * Exports EVERY booked exam in the term, regardless of phase - see loadExams.
 *
 * @param {string}  opts.termId  term _id or name
 * @param {object} [opts.db]     mongo Db (defaults to the mongoose connection)
 * @param {Date}   [opts.now]    injectable clock, for deterministic tests
 * @param {boolean}[opts.includeLogSheet=true]
 * @returns {Promise<{buffer:Buffer, filename:string, anomalies:Array, stats:object}>}
 */
async function buildScheduleExport({ termId, db, now = new Date(), includeLogSheet = true }) {
  const conn = resolveDb(db);
  const term = await loadTerm(conn, termId);
  const [schedulingConfig, exams, counts] = await Promise.all([
    loadSchedulingConfig(conn),
    loadExams(conn, { termId: term._id }),
    loadExamCounts(conn, { termId: term._id }),
  ]);

  if (!exams.length) {
    throw new ExportError(
      422,
      `No booked exams for term ${term.name}. Nothing to export.`
    );
  }

  const anomalies = [];
  const record = (type, severity, detail, exam) =>
    anomalies.push({
      type,
      severity,
      detail,
      courseCode: exam ? exam.courseCode : "",
      examType: exam ? exam.examType : "",
      dateKey: exam && exam.dateKey ? exam.dateKey : "",
      department: exam ? exam.department || "" : "",
      phaseNumber: exam && exam.phaseNumber != null ? exam.phaseNumber : "",
      status: exam ? exam.status || "" : "",
    });

  // --- pass 1: normalise dates, and fail loudly on an unknown exam type -----
  const prepared = [];
  for (const exam of exams) {
    const suffix = EXAM_TYPE_SUFFIX[exam.examType];
    if (!suffix) {
      // A silently untagged cell is indistinguishable from a data-entry error,
      // so this fails the whole export rather than writing a bare course code.
      throw new ExportError(
        500,
        `Unrecognised examType "${exam.examType}" on ${exam.courseCode}. ` +
          `Add it to EXAM_TYPE_SUFFIX in config/exportStyles.js. No file was produced.`
      );
    }
    const dateKey = cal.examDateKey(exam.examDate);
    if (!dateKey) {
      record("invalid-date", "error", "examDate is missing or unparseable; exam skipped.", exam);
      continue;
    }
    prepared.push({ ...exam, dateKey, suffix, text: `${exam.courseCode} (${suffix})` });
  }

  // --- calendar ------------------------------------------------------------
  const calendarData = term.calendarData || {};
  const weekStartKeys = calendarData.weekStartDates || [];
  const blockedDates = calendarData.blockedDates || {};
  const softBlockedDates = calendarData.softBlockedDates || {};

  const range = cal.resolveSheetRange({ term, examDateKeys: prepared.map((e) => e.dateKey) });
  range.notes.forEach((n) => record("calendar-range", "info", n, null));

  const calendarRows = cal.buildCalendar({
    startKey: range.startKey,
    endKey: range.endKey,
    weekStartKeys,
  });
  if (!calendarRows.length) {
    throw new ExportError(404, `Term ${term.name} produced an empty calendar (${range.startKey} to ${range.endKey}).`);
  }

  const rowByDate = new Map();
  calendarRows.forEach((row, i) => rowByDate.set(row.dateKey, FIRST_BODY_ROW + i));

  const counterWindow = cal.resolveCounterWindow({ schedulingConfig, weekStartKeys, calendarRows });
  if (counterWindow) {
    // A contiguous 1..n counter over the window, counting every row in it -
    // holiday rows included, which is how the institutional sample numbers it.
    let n = 0;
    for (const row of calendarRows) {
      if (row.dateKey >= counterWindow.startKey && row.dateKey <= counterWindow.endKey) {
        row.counterIndex = ++n;
      }
    }
  }
  const blocked = cal.blockedRuns({ calendarRows, blockedDates, firstBodyRow: FIRST_BODY_ROW });

  // --- pass 2: route each exam to a cell -----------------------------------
  const donor = await loadDonor();
  const deptIndex = buildDeptColumnIndex(donor.headerCells);

  /** "row|col" -> exam entries */
  const cells = new Map();
  const seen = new Set();
  let placed = 0;

  for (const exam of prepared) {
    if (!exam.department) {
      record(
        "missing-course",
        "error",
        `No course document matches code "${exam.courseCode}", so its department is unknown; exam skipped.`,
        exam
      );
      continue;
    }
    const col = resolveDeptColumn(exam.department, deptIndex);
    if (!col) {
      record(
        "unmapped-department",
        "error",
        `Department "${exam.department}" matches no template column and has no alias; exam skipped. ` +
          `Add it to config/departmentAliases.js.`,
        exam
      );
      continue;
    }
    const row = rowByDate.get(exam.dateKey);
    if (!row) {
      const why =
        cal.weekdayOf(exam.dateKey) === styles.EXCLUDED_WEEKDAY
          ? "falls on a Friday, which never hosts an exam"
          : `falls outside the term (${range.termStartKey} to ${range.termEndKey})`;
      record("date-not-in-calendar", "error", `${exam.dateKey} ${why}; exam skipped.`, exam);
      continue;
    }
    if (blockedDates[exam.dateKey]) {
      record(
        "exam-on-closed-day",
        "warning",
        `Booked on "${blockedDates[exam.dateKey]}", a hard-blocked day. Written to the sheet anyway.`,
        exam
      );
    }

    const dupKey = `${exam.dateKey}|${col}|${exam.courseCode}|${exam.examType}`;
    if (seen.has(dupKey)) {
      record(
        "duplicate-booking",
        "warning",
        `${exam.courseCode} ${exam.examType} appears more than once on ${exam.dateKey} in the same department.`,
        exam
      );
    }
    seen.add(dupKey);

    const key = `${row}|${col}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(exam);
    placed++;
  }

  // --- build the workbook --------------------------------------------------
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KFUPM Exam Scheduling System";
  workbook.created = now;
  workbook.modified = now;

  // No printArea: exceljs 4.4 cannot serialise one correctly. Every input form
  // produces a malformed Print_Area defined name ("$A1:$AG99" with the rows left
  // relative, or "$$A$1"), which Excel refuses to open. Omitting it costs only
  // an explicit print range - fitToPage and scale still apply, and the used
  // range is exactly A1:AG{lastRow} anyway.
  const sheet = workbook.addWorksheet(sheetName(term.name), {
    properties: donor.properties,
    pageSetup: donor.pageSetup,
    views: [donor.view],
  });

  // column widths, verbatim from the template
  donor.columns.forEach((c, i) => {
    if (c.width != null) sheet.getColumn(i + 1).width = c.width;
  });

  // row 1, verbatim from the template
  for (const h of donor.headerCells) {
    const cell = sheet.getCell(HEADER_ROW, h.col);
    if (h.value !== null && h.value !== undefined) cell.value = h.value;
    cell.style = h.style;
  }

  const deptWidth = (c) => donor.columns[c - 1] && donor.columns[c - 1].width;

  // body: one row per exam-eligible day
  calendarRows.forEach((row, i) => {
    const sheetRow = FIRST_BODY_ROW + i;
    const isClosed = Boolean(blockedDates[row.dateKey]);
    const softLabel = softBlockedDates[row.dateKey];
    const wrapped = [];

    // A - week number. Written at the merge anchor only (see the merge pass);
    // every cell still gets the style so the merged band borders correctly.
    const weekCell = sheet.getCell(sheetRow, COL.WEEK);
    weekCell.font = FONT_BOLD;
    weekCell.alignment = CENTER;
    weekCell.border = BORDER_THIN;

    // B - day letter
    const dayCell = sheet.getCell(sheetRow, COL.DAY);
    dayCell.value = row.dayLetter;
    dayCell.font = FONT_BOLD;
    dayCell.alignment = CENTER;
    dayCell.border = BORDER_THIN;

    // C - exam-window day counter. Counts every row in the window, holidays
    // included; blank outside it.
    const counterCell = sheet.getCell(sheetRow, COL.COUNTER);
    counterCell.font = FONT_BOLD;
    counterCell.alignment = CENTER;
    counterCell.border = BORDER_THIN;
    if (counterWindow && row.dateKey >= counterWindow.startKey && row.dateKey <= counterWindow.endKey) {
      counterCell.value = row.counterIndex;
      counterCell.fill = solidFill(FILL.WHITE);
    }

    // D - the date, written as the Excel serial the template itself stores.
    // Writing a raw serial keeps exceljs's local-timezone date handling out of
    // the picture entirely; the numFmt is what renders it as a date.
    const dateCell = sheet.getCell(sheetRow, COL.DATE);
    dateCell.value = toSerial(row.dateKey);
    dateCell.numFmt = DATE_FMT;
    dateCell.font = FONT;
    dateCell.alignment = CENTER;
    dateCell.border = BORDER_THIN;

    // E..AG - departments, then the events column
    for (let c = COL.DEPT_FIRST; c <= COL.EVENTS; c++) {
      const cell = sheet.getCell(sheetRow, c);
      cell.font = FONT;
      cell.alignment = CENTER_WRAP;
      cell.border = BORDER_THIN;
      if (isClosed) cell.fill = solidFill(FILL.CLOSED);

      if (c === COL.EVENTS) {
        // AG is never a department. Soft-blocked days carry the event name so
        // it reads as "not an exam day, an event".
        if (softLabel && !isClosed) {
          cell.value = String(softLabel);
          cell.fill = solidFill(FILL.EVENT);
          wrapped.push({ text: softLabel, width: deptWidth(c) });
        }
        continue;
      }

      const entries = cells.get(`${sheetRow}|${c}`);
      if (!entries || !entries.length) continue; // leave empty cells untouched

      // Deterministic order: exam type, then course code. Re-exporting the same
      // data must produce the same file for the idempotence test to mean anything.
      entries.sort((a, b) => {
        const ta = EXAM_TYPE_ORDER.indexOf(a.examType);
        const tb = EXAM_TYPE_ORDER.indexOf(b.examType);
        if (ta !== tb) return ta - tb;
        return a.courseCode.localeCompare(b.courseCode);
      });
      const text = entries.map((e) => e.text).join(CELL_JOIN);
      cell.value = text;
      wrapped.push({ text, width: deptWidth(c) });
    }

    if (wrapped.length) sheet.getRow(sheetRow).height = estimateRowHeight(wrapped);
  });

  // week merges in column A
  for (const block of cal.weekBlocks(calendarRows, FIRST_BODY_ROW)) {
    sheet.getCell(block.firstRow, COL.WEEK).value = block.week;
    if (block.lastRow > block.firstRow) {
      sheet.mergeCells(block.firstRow, COL.WEEK, block.lastRow, COL.WEEK);
    }
  }

  // holiday labels across the grey band
  applyHolidayLabels({ sheet, blocked, cells, record });


  // Phase is no longer a filter, but it is still worth reporting: it is the
  // field that proved unreliable, so showing what the export actually swept up
  // is how anyone would notice it drifting further.
  const phaseTally = new Map();
  for (const e of exams) {
    const key = e.phaseNumber == null ? "unset" : String(e.phaseNumber);
    phaseTally.set(key, (phaseTally.get(key) || 0) + 1);
  }
  const phaseBreakdown = [...phaseTally.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([k, n]) => `phase ${k}: ${n}`)
    .join(", ");

  if (includeLogSheet) {
    appendLogSheet({
      workbook,
      term,
      now,
      range,
      calendarRows,
      counterWindow,
      blocked,
      anomalies,
      stats: { considered: exams.length, placed, cells: cells.size, counts, phaseBreakdown },
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(buffer),
    filename: buildFilename({ termName: term.name, now }),
    anomalies,
    stats: {
      termName: term.name,
      scope: "all bookings in the term, any phase",
      phaseBreakdown,
      // The full reconciliation, so a count can always be accounted for:
      //   examsInTerm = examsPlaced + examsSkipped + excludedByStatus
      examsInTerm: counts.totalInTerm,
      excludedByStatus: counts.ignoredStatus,
      examsConsidered: exams.length,
      examsPlaced: placed,
      examsSkipped: exams.length - placed,
      cellsWritten: cells.size,
      calendarRows: calendarRows.length,
      rangeStart: range.startKey,
      rangeEnd: range.endKey,
      rangeSource: range.source,
      closedDayBands: blocked.length,
    },
  };
}

/**
 * Write each holiday's name once, centred across its grey band.
 *
 * A merge makes every cell but the top-left unwritable, so a band that has an
 * exam booked inside it cannot simply be merged end to end - that would hide
 * the exam. The label therefore spans the longest run of holiday rows that
 * carry no exams; if every row in the band has one, the label is dropped and
 * reported, since the grey fill already shows the period is closed and the
 * exams are the part that matters.
 */
function applyHolidayLabels({ sheet, blocked, cells, record }) {
  const rowHasExam = (row) => {
    for (let c = COL.DEPT_FIRST; c <= COL.DEPT_LAST; c++) {
      if (cells.has(`${row}|${c}`)) return true;
    }
    return false;
  };

  for (const band of blocked) {
    let best = null;
    let run = null;
    for (let r = band.firstRow; r <= band.lastRow; r++) {
      if (rowHasExam(r)) {
        run = null;
        continue;
      }
      run = run && run.last === r - 1 ? { first: run.first, last: r } : { first: r, last: r };
      if (!best || run.last - run.first > best.last - best.first) best = { ...run };
    }

    if (!best) {
      record(
        "holiday-label-omitted",
        "warning",
        `"${band.label}" spans rows ${band.firstRow}-${band.lastRow} but every day in it has a booked exam, ` +
          `so the label was left out to keep the exams visible. The grey fill still marks the period as closed.`,
        null
      );
      continue;
    }

    const cell = sheet.getCell(best.first, COL.DEPT_FIRST);
    cell.value = band.label;
    cell.font = FONT;
    cell.alignment = CENTER_WRAP;
    sheet.mergeCells(best.first, COL.DEPT_FIRST, best.last, COL.EVENTS);
  }
}

/**
 * The anomaly report, as a second worksheet. It travels with the file, so
 * whoever opens the workbook next sees what was skipped without needing the
 * server logs or a second request.
 */
function appendLogSheet({
  workbook,
  term,
  now,
  range,
  calendarRows,
  counterWindow,
  blocked,
  anomalies,
  stats,
}) {
  const ws = workbook.addWorksheet("Export Log");
  ws.columns = [
    { header: "Field", key: "a", width: 26 },
    { header: "Value", key: "b", width: 22 },
    { header: "Detail", key: "c", width: 96 },
    { header: "Course", key: "d", width: 12 },
    { header: "Exam type", key: "e", width: 10 },
    { header: "Date", key: "f", width: 12 },
    { header: "Department", key: "g", width: 34 },
    { header: "Phase", key: "h", width: 7 },
    { header: "Status", key: "i", width: 11 },
  ];
  ws.getRow(1).font = { ...FONT_BOLD, size: 10 };

  const summary = [
    ["Generated (UTC)", now.toISOString()],
    ["Term", String(term.name)],
    [
      "Scope",
      "all phases",
      "Every booking in the term is included regardless of phaseNumber; only cancelled and rejected are left out.",
    ],
    ["Phases present", stats.phaseBreakdown],
    ["Sheet range", `${range.startKey} to ${range.endKey}`],
    ["Range source", range.source === "teaching-period" ? "classes begin -> last day of classes" : "registered term dates"],
    ["Calendar rows", calendarRows.length],
    ["Weeks", `${calendarRows[0].week} to ${calendarRows[calendarRows.length - 1].week}`],
    ["Exam-window counter", counterWindow ? `${counterWindow.startKey} to ${counterWindow.endKey} (weeks ${counterWindow.firstWeek}-${counterWindow.lastWeek})` : "not configured - column C left blank"],
    ["Closed-day bands", blocked.map((b) => `${b.label} (${b.dateKeys.length}d)`).join("; ") || "none"],
    // Full reconciliation, so the written count can always be accounted for
    // against the term's booking total.
    ["Bookings in term", stats.counts.totalInTerm],
    [
      "- eligible",
      stats.considered,
      `${stats.counts.totalInTerm} in term, minus ${stats.counts.ignoredStatus} cancelled/rejected`,
    ],
    ["- written to the grid", stats.placed],
    [
      "- skipped",
      stats.considered - stats.placed,
      stats.considered - stats.placed > 0
        ? "see the anomaly rows below for the reason each one was skipped"
        : "nothing in scope was dropped",
    ],
    ["Cells written", stats.cells],
    ["Anomalies", anomalies.length],
  ];
  for (const [a, b, c] of summary) ws.addRow({ a, b, c });

  ws.addRow({});
  const heading = ws.addRow({ a: "Anomalies" });
  heading.font = { ...FONT_BOLD, size: 10 };
  if (!anomalies.length) {
    ws.addRow({ a: "", b: "none", c: "Every exam in range was written to a department column." });
  } else {
    for (const an of anomalies) {
      ws.addRow({
        a: an.type,
        b: an.severity,
        c: an.detail,
        d: an.courseCode,
        e: an.examType,
        f: an.dateKey,
        g: an.department,
        h: an.phaseNumber,
        i: an.status,
      });
    }
  }
  ws.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  ws.getRow(1).font = { ...FONT_BOLD, size: 10 };
}

module.exports = {
  buildScheduleExport,
  verifyTemplate,
  loadDonor,
  buildDeptColumnIndex,
  resolveDeptColumn,
  sheetName,
  buildFilename,
  toSerial,
  estimateRowHeight,
  ExportError,
  TEMPLATE_PATH,
};
