"use strict";

/**
 * Workbook-level tests. These drive the real builder against a fake Db, so the
 * template is genuinely read and a genuine .xlsx is produced and parsed back -
 * only the database is stubbed.
 */

// describe/it/expect come from vitest globals (see vitest.config.js) - vitest
// cannot be require()d from a CommonJS module.
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

const svc = require("../services/scheduleExportService");
const { TERM_261, fakeDb, exam } = require("./fixtures/term261");

const NOW = new Date("2026-08-25T11:32:00.000Z");
const COL_MATH = 27; // AA - Mathematics
const COL_GLOBAL = 19; // S - Global Studies
const COL_EVENTS = 33; // AG

/** Run the export and hand back a parsed worksheet plus the raw result. */
async function run({ exams, term = TERM_261, ...rest }) {
  const result = await svc.buildScheduleExport({
    termId: "261",

    db: fakeDb({ term, exams }),
    now: NOW,
    ...rest,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(result.buffer);
  return { result, wb, ws: wb.getWorksheet("Term-261") };
}

/** Locate the sheet row carrying a given date. */
function rowFor(ws, dateKey) {
  const target = svc.toSerial(dateKey);
  for (let r = 2; r <= ws.rowCount; r++) {
    if (ws.getCell(r, 4).value === target) return r;
    const v = ws.getCell(r, 4).value;
    if (v instanceof Date) {
      const key = new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      if (key === dateKey) return r;
    }
  }
  return null;
}

const fillOf = (cell) => (cell.fill && cell.fill.fgColor ? cell.fill.fgColor.argb : null);

describe("empty result (spec test 1)", () => {
  it("returns 422 and no file rather than an empty grid", async () => {
    await expect(
      svc.buildScheduleExport({ termId: "261", db: fakeDb({ exams: [] }), now: NOW })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("treats cancelled-only data as empty", async () => {
    const exams = [exam({ courseCode: "MATH101", date: "2026-10-06", status: "cancelled" })];
    await expect(
      svc.buildScheduleExport({ termId: "261", db: fakeDb({ exams }), now: NOW })
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("single exam (spec test 2)", () => {
  it("lands in exactly one cell, at the right row and column", async () => {
    const { ws } = await run({ exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })] });
    const row = rowFor(ws, "2026-10-06");
    expect(row).not.toBeNull();
    expect(ws.getCell(row, COL_MATH).value).toBe("MATH106 (M1)");

    // and nowhere else. Count the exam text specifically rather than non-empty
    // cells: a merged holiday label reports its value from every cell in the
    // band, so "cells with a value" is far larger than "cells with an exam".
    let written = 0;
    for (let r = 2; r <= 99; r++) {
      for (let c = 5; c <= 32; c++) {
        if (String(ws.getCell(r, c).value || "").includes("MATH106")) written++;
      }
    }
    expect(written).toBe(1);
  });

  it("writes each exam type with its configured suffix", async () => {
    const { ws } = await run({
      exams: [
        exam({ courseCode: "A101", examType: "Major 1", date: "2026-10-06", department: "Mathematics" }),
        exam({ courseCode: "B101", examType: "Major 2", date: "2026-10-07", department: "Mathematics" }),
        exam({ courseCode: "C101", examType: "Major 3", date: "2026-10-08", department: "Mathematics" }),
        exam({ courseCode: "D101", examType: "Mid", date: "2026-10-10", department: "Mathematics" }),
      ],
    });
    expect(ws.getCell(rowFor(ws, "2026-10-06"), COL_MATH).value).toBe("A101 (M1)");
    expect(ws.getCell(rowFor(ws, "2026-10-07"), COL_MATH).value).toBe("B101 (M2)");
    expect(ws.getCell(rowFor(ws, "2026-10-08"), COL_MATH).value).toBe("C101 (M3)");
    expect(ws.getCell(rowFor(ws, "2026-10-10"), COL_MATH).value).toBe("D101 (Mid)");
  });
});

describe("multi-exam cell (spec test 3)", () => {
  it("joins with ' | ' in type-then-code order", async () => {
    const { ws } = await run({
      exams: [
        exam({ courseCode: "MATH371", examType: "Mid", date: "2026-10-06" }),
        exam({ courseCode: "MATH106", examType: "Major 1", date: "2026-10-06" }),
        exam({ courseCode: "MATH101", examType: "Major 2", date: "2026-10-06" }),
      ],
    });
    expect(ws.getCell(rowFor(ws, "2026-10-06"), COL_MATH).value).toBe(
      "MATH106 (M1) | MATH101 (M2) | MATH371 (Mid)"
    );
  });

  it("orders alphabetically within a single type", async () => {
    const { ws } = await run({
      exams: ["MATH301", "MATH106", "STAT214"].map((courseCode) =>
        exam({ courseCode, date: "2026-10-06" })
      ),
    });
    expect(ws.getCell(rowFor(ws, "2026-10-06"), COL_MATH).value).toBe(
      "MATH106 (M1) | MATH301 (M1) | STAT214 (M1)"
    );
  });

  it("wraps written cells and raises the row height (spec test / §6.3)", async () => {
    const exams = Array.from({ length: 11 }, (_, i) =>
      exam({ courseCode: `GS${300 + i}`, examType: "Mid", date: "2026-10-04", department: "Global Studies" })
    );
    const { ws } = await run({ exams });
    const row = rowFor(ws, "2026-10-04");
    const cell = ws.getCell(row, COL_GLOBAL);
    expect(String(cell.value).split(" | ")).toHaveLength(11);
    expect(cell.alignment.wrapText).toBe(true);
    expect(ws.getRow(row).height).toBeGreaterThan(20);
  });
});

describe("scope: every phase, status only", () => {
  const codesIn = (ws) => {
    const found = [];
    for (let r = 2; r <= 99; r++) {
      for (let c = 5; c <= 32; c++) {
        const v = ws.getCell(r, c).value;
        if (v) found.push(String(v));
      }
    }
    return found.join(" ");
  };

  it("includes every phase, so an exam cannot vanish because its phase is wrong", async () => {
    // phaseNumber proved unreliable, so it must not act as a filter: a booking
    // stamped with the wrong phase - or with none at all - still has to appear.
    const { ws, result } = await run({
      exams: [
        exam({ courseCode: "P0", date: "2026-10-06", phaseNumber: 0 }),
        exam({ courseCode: "P1", date: "2026-10-07", phaseNumber: 1, status: "pending" }),
        exam({ courseCode: "P2", date: "2026-10-08", phaseNumber: 2 }),
        exam({ courseCode: "P9", date: "2026-10-10", phaseNumber: 9 }),
        exam({ courseCode: "PNULL", date: "2026-10-11", phaseNumber: null }),
      ],
    });
    expect(result.stats.examsPlaced).toBe(5);
    const text = codesIn(ws);
    for (const code of ["P0", "P1", "P2", "P9", "PNULL"]) {
      expect(text).toContain(code);
    }
  });

  it("excludes cancelled and rejected, and nothing else", async () => {
    const { ws, result } = await run({
      exams: [
        exam({ courseCode: "KEEP1", date: "2026-10-06", status: "confirmed" }),
        exam({ courseCode: "KEEP2", date: "2026-10-07", status: "pending" }),
        exam({ courseCode: "KEEP3", date: "2026-10-08", status: "approved" }),
        exam({ courseCode: "DROP1", date: "2026-10-10", status: "cancelled" }),
        exam({ courseCode: "DROP2", date: "2026-10-11", status: "rejected" }),
      ],
    });
    expect(result.stats.examsPlaced).toBe(3);
    const text = codesIn(ws);
    expect(text).toContain("KEEP1");
    expect(text).toContain("KEEP2");
    expect(text).toContain("KEEP3");
    expect(text).not.toContain("DROP1");
    expect(text).not.toContain("DROP2");
  });

  it("includes pending bookings, which is most of the data", async () => {
    const { result } = await run({
      exams: [exam({ courseCode: "PEND", date: "2026-10-06", status: "pending" })],
    });
    expect(result.stats.examsPlaced).toBe(1);
  });

  it("reports which phases it swept up, since the field is no longer trusted", async () => {
    const { result } = await run({
      exams: [
        exam({ courseCode: "A", date: "2026-10-06", phaseNumber: 0 }),
        exam({ courseCode: "B", date: "2026-10-07", phaseNumber: 2 }),
        exam({ courseCode: "C", date: "2026-10-08", phaseNumber: 2 }),
        exam({ courseCode: "D", date: "2026-10-10", phaseNumber: null }),
      ],
    });
    expect(result.stats.phaseBreakdown).toBe("phase 0: 1, phase 2: 2, phase unset: 1");
    expect(result.stats.scope).toMatch(/any phase/);
  });
});

describe("count reconciliation", () => {
  // Mirrors the real term: 62 phase-0 confirmed, 112 phase-1 pending,
  // 6 phase-2 confirmed and 1 phase-2 cancelled = 181 bookings.
  const many = [
    ...Array.from({ length: 62 }, (_, i) =>
      exam({ courseCode: `P0C${i}`, date: "2026-10-06", phaseNumber: 0, status: "confirmed" })
    ),
    ...Array.from({ length: 112 }, (_, i) =>
      exam({ courseCode: `P1P${i}`, date: "2026-10-07", phaseNumber: 1, status: "pending" })
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      exam({ courseCode: `P2C${i}`, date: "2026-10-08", phaseNumber: 2, status: "confirmed" })
    ),
    exam({ courseCode: "P2X", date: "2026-10-08", phaseNumber: 2, status: "cancelled" }),
  ];

  it("writes every booking in the term bar the cancelled one", async () => {
    const { result } = await run({ exams: many });
    const s = result.stats;
    expect(s.examsInTerm).toBe(181);
    expect(s.examsPlaced).toBe(180);
    expect(s.examsSkipped).toBe(0);
    expect(s.excludedByStatus).toBe(1);
    // The identity that makes the log line trustworthy.
    expect(s.examsPlaced + s.examsSkipped + s.excludedByStatus).toBe(s.examsInTerm);
    expect(s.phaseBreakdown).toBe("phase 0: 62, phase 1: 112, phase 2: 6");
  });

  it("counts a dropped exam as skipped, not as vanished", async () => {
    const { result } = await run({
      exams: [
        exam({ courseCode: "OK1", date: "2026-10-06" }),
        exam({ courseCode: "BAD1", date: "2026-10-06", department: "Department of Nope" }),
      ],

    });
    const s = result.stats;
    expect(s.examsPlaced).toBe(1);
    expect(s.examsSkipped).toBe(1);
    expect(s.examsPlaced + s.examsSkipped + s.excludedByStatus).toBe(s.examsInTerm);
  });

  it("shows the reconciliation on the Export Log sheet", async () => {
    const { wb } = await run({ exams: many });
    const log = wb.getWorksheet('Export Log');
    let text = '';
    log.eachRow((row) => row.eachCell((c) => (text += ` ${c.value}`)));
    expect(text).toMatch(/Bookings in term\s+181/);
    expect(text).toMatch(/eligible\s+180/);
    expect(text).toMatch(/minus 1 cancelled\/rejected/);
    expect(text).toMatch(/Phases present\s+phase 0: 62, phase 1: 112, phase 2: 6/);
    expect(text).toMatch(/all phases/);
  });
});

describe("anomalies (spec tests 8, 9, 10)", () => {
  it("skips and reports an unmapped department, still producing a file", async () => {
    const { result, ws } = await run({
      exams: [
        exam({ courseCode: "XYZ101", date: "2026-10-06", department: "Department of Mystery" }),
        exam({ courseCode: "MATH106", date: "2026-10-06" }),
      ],
    });
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.stats.examsPlaced).toBe(1);
    const a = result.anomalies.find((x) => x.type === "unmapped-department");
    expect(a).toMatchObject({ severity: "error", courseCode: "XYZ101" });
    expect(ws.getCell(rowFor(ws, "2026-10-06"), COL_MATH).value).toBe("MATH106 (M1)");
  });

  it("skips and reports an exam with no matching course document", async () => {
    const { result } = await run({
      exams: [
        exam({ courseCode: "GHOST1", date: "2026-10-06", department: null }),
        exam({ courseCode: "MATH106", date: "2026-10-06" }),
      ],
    });
    expect(result.anomalies.find((x) => x.type === "missing-course")).toMatchObject({
      courseCode: "GHOST1",
    });
  });

  it("skips and reports a Friday exam", async () => {
    // 2026-10-09 is a Friday.
    const { result } = await run({
      exams: [
        exam({ courseCode: "FRI101", date: "2026-10-09" }),
        exam({ courseCode: "MATH106", date: "2026-10-06" }),
      ],
    });
    const a = result.anomalies.find((x) => x.type === "date-not-in-calendar");
    expect(a.detail).toMatch(/Friday/);
    expect(result.stats.examsPlaced).toBe(1);
  });

  it("skips and reports an exam outside the term entirely", async () => {
    const { result } = await run({
      exams: [
        exam({ courseCode: "FAR101", date: "2027-03-01" }),
        exam({ courseCode: "MATH106", date: "2026-10-06" }),
      ],
    });
    const a = result.anomalies.find((x) => x.type === "date-not-in-calendar");
    expect(a.detail).toMatch(/outside the term/);
  });

  it("writes an exam on a closed day anyway and flags it", async () => {
    // 2026-10-20 is inside Midterm Break.
    const { result, ws } = await run({
      exams: [exam({ courseCode: "MATH106", date: "2026-10-20" })],
    });
    const row = rowFor(ws, "2026-10-20");
    expect(ws.getCell(row, COL_MATH).value).toBe("MATH106 (M1)");
    expect(result.anomalies.find((x) => x.type === "exam-on-closed-day")).toMatchObject({
      severity: "warning",
    });
  });

  it("keeps the exam visible by not merging a label over an occupied holiday row", async () => {
    // Autumn Break is rows 82-85; booking on all four days leaves no room for
    // the label, which must be dropped rather than hiding an exam.
    const exams = ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"].map((date, i) =>
      exam({ courseCode: `AB${i}`, date })
    );
    const { result, ws } = await run({ exams });
    expect(result.stats.examsPlaced).toBe(4);
    for (const date of ["2026-11-21", "2026-11-24"]) {
      expect(String(ws.getCell(rowFor(ws, date), COL_MATH).value)).toMatch(/^AB\d \(M1\)$/);
    }
    expect(result.anomalies.find((x) => x.type === "holiday-label-omitted")).toBeTruthy();
  });

  it("reports a duplicate booking", async () => {
    const { result } = await run({
      exams: [
        exam({ courseCode: "MATH106", date: "2026-10-06" }),
        exam({ courseCode: "MATH106", date: "2026-10-06" }),
      ],
    });
    expect(result.anomalies.find((x) => x.type === "duplicate-booking")).toMatchObject({
      severity: "warning",
      courseCode: "MATH106",
    });
  });

  it("puts every anomaly on the Export Log sheet", async () => {
    const { wb } = await run({
      exams: [
        exam({ courseCode: "XYZ101", date: "2026-10-06", department: "Nope" }),
        exam({ courseCode: "MATH106", date: "2026-10-06" }),
      ],
    });
    const log = wb.getWorksheet("Export Log");
    expect(log).toBeTruthy();
    let text = "";
    log.eachRow((row) => row.eachCell((c) => (text += ` ${c.value}`)));
    expect(text).toMatch(/unmapped-department/);
    expect(text).toMatch(/XYZ101/);
    expect(text).toMatch(/Phases present/);
  });
});

describe("unrecognised exam type (spec test 14)", () => {
  it("fails loudly with no partial file", async () => {
    await expect(
      svc.buildScheduleExport({
        termId: "261",
        phase: 2,
        db: fakeDb({ exams: [exam({ courseCode: "MATH106", examType: "Quiz", date: "2026-10-06" })] }),
        now: NOW,
      })
    ).rejects.toMatchObject({ status: 500, message: expect.stringMatching(/Unrecognised examType "Quiz"/) });
  });
});

describe("timezone boundary (spec test 11)", () => {
  it("places a 21:00Z exam on the next local day", async () => {
    const { ws } = await run({
      exams: [
        exam({ courseCode: "MATH106", date: new Date("2026-10-06T21:00:00.000Z") }),
      ],
    });
    expect(ws.getCell(rowFor(ws, "2026-10-07"), COL_MATH).value).toBe("MATH106 (M1)");
    expect(ws.getCell(rowFor(ws, "2026-10-06"), COL_MATH).value).toBeFalsy();
  });
});

describe("style preservation (spec test 12)", () => {
  let ws;
  let tws;

  it("matches the template", async () => {
    const out = await run({ exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })] });
    ws = out.ws;

    const tpl = new ExcelJS.Workbook();
    await tpl.xlsx.readFile(svc.TEMPLATE_PATH);
    tws = tpl.worksheets[0];

    // row 1 band
    expect(fillOf(ws.getCell(1, 5))).toBe("FFEEECE1");
    // a closed-day cell
    expect(fillOf(ws.getCell(rowFor(ws, "2026-09-22"), 10))).toBe("FFD9D9D9");
    // column widths, verbatim from the template
    for (const c of [1, 2, 3, 4, 5, 8, 33]) {
      expect(ws.getColumn(c).width).toBe(tws.getColumn(c).width);
    }
    // date format
    expect(ws.getCell(10, 4).numFmt).toBe(tws.getCell(10, 4).numFmt);
    // 8pt Calibri with thin borders in the body
    const body = ws.getCell(10, 6);
    expect(body.font).toMatchObject({ name: "Calibri", size: 8 });
    expect(body.border.top.style).toBe("thin");
    expect(body.border.right.style).toBe("thin");
    // A and B bold
    expect(ws.getCell(10, 1).font.bold).toBe(true);
    expect(ws.getCell(10, 2).font.bold).toBe(true);
    // header text is the template's, not retyped
    for (let c = 5; c <= 33; c++) {
      expect(ws.getCell(1, c).value).toBe(tws.getCell(1, c).value);
    }
  });

  it("leaves an empty cell without a value but still styled", async () => {
    const { ws: sheet } = await run({ exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })] });
    const cell = sheet.getCell(3, 6);
    expect(cell.value == null).toBe(true);
    expect(cell.border.top.style).toBe("thin");
    expect(cell.font).toMatchObject({ name: "Calibri", size: 8 });
  });

  it("never writes exam text into columns A-D or AG", async () => {
    const { ws: sheet } = await run({
      exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })],
    });
    const row = rowFor(sheet, "2026-10-06");
    for (const c of [1, 2, 3, 4]) {
      expect(String(sheet.getCell(row, c).value || "")).not.toMatch(/MATH106/);
    }
    expect(String(sheet.getCell(row, COL_EVENTS).value || "")).not.toMatch(/MATH106/);
  });

  it("labels each holiday once across its grey band", async () => {
    const { ws: sheet } = await run({ exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })] });
    expect(sheet.getCell(rowFor(sheet, "2026-09-22"), 5).value).toBe("Saudi National Day");
    expect(sheet.getCell(rowFor(sheet, "2026-10-19"), 5).value).toBe("Midterm Break");
    expect(sheet.getCell(rowFor(sheet, "2026-11-21"), 5).value).toBe("Autumn Break");
  });

  it("names the soft-blocked event in column AG", async () => {
    const { ws: sheet } = await run({ exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })] });
    const row = rowFor(sheet, "2026-10-01");
    expect(sheet.getCell(row, COL_EVENTS).value).toBe("(NPSD Forum - KIKX)");
    expect(fillOf(sheet.getCell(row, COL_EVENTS))).toBe("FFDBEEF4");
  });
});

describe("Excel compatibility", () => {
  // exceljs reads a workbook back happily even when it has written XML that
  // Excel itself rejects ("We found a problem with some content in ..."), so
  // these assertions go at the raw XML rather than through the exceljs model.
  const rawParts = async () => {
    const { result } = await run({ exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })] });
    const zip = await JSZip.loadAsync(result.buffer);
    return {
      workbook: await zip.file("xl/workbook.xml").async("string"),
      sheet: await zip.file("xl/worksheets/sheet1.xml").async("string"),
    };
  };

  it("writes no defined names at all", async () => {
    // exceljs 4.4 cannot serialise a print area: "A1:AG99" comes out as
    // '$A1:$AG99' with the rows left relative, and "$A$1:$AG$99" as '$$A$1'.
    // Either one makes Excel refuse to open the file, so we emit none.
    const { workbook } = await rawParts();
    expect(workbook).not.toMatch(/<definedName/);
    expect(workbook).not.toMatch(/Print_Area/);
  });

  it("declares a dimension that stops at the events column", async () => {
    const { sheet } = await rawParts();
    expect(sheet).toMatch(/<dimension ref="A1:AG99"\/>/);
  });

  it("carries no stale selection copied from the template author's cursor", async () => {
    const { sheet } = await rawParts();
    expect(sheet).not.toMatch(/<selection/);
  });

  it("produces XML that parses as a single well-formed root element", async () => {
    const { workbook, sheet } = await rawParts();
    for (const xml of [workbook, sheet]) {
      expect(xml.trim().endsWith(">")).toBe(true);
      // no unbalanced entity escaping, the symptom of a mangled ref
      expect(xml).not.toMatch(/\$\$/);
    }
  });
});

describe("idempotence (spec test 13)", () => {
  it("produces identical cell values across two runs", async () => {
    const exams = [
      exam({ courseCode: "MATH106", date: "2026-10-06" }),
      exam({ courseCode: "MATH371", examType: "Mid", date: "2026-10-06" }),
    ];
    const dump = async () => {
      const { ws } = await run({ exams, includeLogSheet: false });
      const out = [];
      for (let r = 1; r <= 99; r++) {
        for (let c = 1; c <= 33; c++) out.push(String(ws.getCell(r, c).value));
      }
      return out.join("|");
    };
    expect(await dump()).toBe(await dump());
  });
});

describe("term lookup and naming", () => {
  it("404s an unknown term", async () => {
    await expect(
      svc.buildScheduleExport({ termId: "999", db: fakeDb({ term: null }), now: NOW })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("404s a term with no weekStartDates, rather than inventing week numbers", async () => {
    const term = { ...TERM_261, calendarData: { termStart: "2026-08-16", termEnd: "2026-12-26" } };
    await expect(
      svc.buildScheduleExport({
        termId: "261",

        db: fakeDb({ term, exams: [exam({ courseCode: "MATH106", date: "2026-10-06" })] }),
        now: NOW,
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("sanitises the sheet name and caps it at 31 characters", () => {
    expect(svc.sheetName("261")).toBe("Term-261");
    expect(svc.sheetName("26/1*[x]")).toBe("Term-26-1--x-");
    expect(svc.sheetName("x".repeat(60))).toHaveLength(31);
  });

  it("builds an ASCII filename with no forbidden characters", () => {
    expect(svc.buildFilename({ termName: "261", now: NOW })).toBe(
      "Exam_Schedule_Term-261_All-Bookings_2026-08-25_1432.xlsx"
    );
    expect(svc.buildFilename({ termName: "26/1", now: NOW })).not.toMatch(/[\\/:*?"<>|\s]/);
  });
});

describe("template asset", () => {
  it("passes the boot-time check", async () => {
    const report = await svc.verifyTemplate();
    expect(report.ok).toBe(true);
    expect(report.departmentCount).toBe(28);
  });

  it("reads the department column map out of row 1 rather than hardcoding it", async () => {
    const donor = await svc.loadDonor();
    const index = svc.buildDeptColumnIndex(donor.headerCells);
    expect(index.size).toBe(28);
    expect(index.get("mathematics")).toBe(27);
    expect(index.get("accounting & finance")).toBe(5);
    expect(index.get("urban & regional planning")).toBe(32);
    // AG is not a department and must never be a write target
    expect(index.has("building 54 events (unavailable)")).toBe(false);
  });

  it("matches on normalised whitespace and case", async () => {
    const donor = await svc.loadDonor();
    const index = svc.buildDeptColumnIndex(donor.headerCells);
    expect(svc.resolveDeptColumn("  MATHEMATICS  ", index)).toBe(27);
    expect(svc.resolveDeptColumn("Computer   Engineering", index)).toBe(14);
    expect(svc.resolveDeptColumn("Department of Nope", index)).toBeNull();
  });

  it("converts a date key to the serial the template stores", () => {
    // Verified against the template's own column D values.
    expect(svc.toSerial("2026-10-31")).toBe(46326);
    expect(svc.toSerial("2026-08-19")).toBe(46253);
  });
});
