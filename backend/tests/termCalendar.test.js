"use strict";

/**
 * Calendar-generation regression guards.
 *
 * The headline test here is "reproduces the Term-261 template exactly". The
 * institutional workbook is the only ground truth for what this layout should
 * look like, so if the generator drifts away from it, that is a bug even when
 * the new output looks reasonable.
 */

// describe/it/expect come from vitest globals (see vitest.config.js) - vitest
// cannot be require()d from a CommonJS module.
const cal = require("../services/termCalendarService");
const {
  TERM_261,
  SCHEDULING_CONFIG,
  WEEK_START_DATES,
  BLOCKED_DATES,
  TEMPLATE_WEEK_MERGES,
} = require("./fixtures/term261");

const build = (startKey, endKey, weekStartKeys = WEEK_START_DATES) =>
  cal.buildCalendar({ startKey, endKey, weekStartKeys });

describe("buildCalendar - Term-261 regression (spec test 5)", () => {
  const rows = build("2026-08-19", "2026-12-10");

  it("produces the template's 98 rows spanning 19-Aug to 10-Dec", () => {
    expect(rows).toHaveLength(98);
    expect(rows[0].dateKey).toBe("2026-08-19");
    expect(rows[rows.length - 1].dateKey).toBe("2026-12-10");
  });

  it("numbers weeks 1 through 17", () => {
    expect(rows[0].week).toBe(1);
    expect(rows[rows.length - 1].week).toBe(17);
    expect([...new Set(rows.map((r) => r.week))]).toEqual(
      Array.from({ length: 17 }, (_, i) => i + 1)
    );
  });

  it("excludes every Friday", () => {
    expect(rows.some((r) => cal.weekdayOf(r.dateKey) === 5)).toBe(false);
    expect(rows.some((r) => r.dayLetter === undefined)).toBe(false);
  });

  it("assigns the day letter matching each date's real weekday", () => {
    const expected = { 0: "U", 1: "M", 2: "T", 3: "W", 4: "R", 6: "S" };
    for (const row of rows) {
      expect(row.dayLetter).toBe(expected[cal.weekdayOf(row.dateKey)]);
    }
  });

  it("derives the template's 17 column-A week merges exactly", () => {
    const merges = cal
      .weekBlocks(rows, 2)
      .map((b) => `A${b.firstRow}:A${b.lastRow}=${b.week}`);
    expect(merges).toEqual(TEMPLATE_WEEK_MERGES);
  });

  it("keeps the partial first week short rather than padding it", () => {
    // The term starts on a Wednesday, so week 1 is Wed/Thu/Sat - three rows.
    const week1 = rows.filter((r) => r.week === 1);
    expect(week1.map((r) => r.dayLetter)).toEqual(["W", "R", "S"]);
  });
});

describe("buildCalendar - partial first and last weeks (spec test 6)", () => {
  it("sizes a Thursday start and a Monday end correctly", () => {
    // 2026-08-20 is a Thursday; 2026-08-31 is a Monday.
    const rows = build("2026-08-20", "2026-08-31");
    expect(rows.map((r) => `${r.dateKey}/${r.dayLetter}/w${r.week}`)).toEqual([
      "2026-08-20/R/w1",
      "2026-08-22/S/w1",
      "2026-08-23/U/w2",
      "2026-08-24/M/w2",
      "2026-08-25/T/w2",
      "2026-08-26/W/w2",
      "2026-08-27/R/w2",
      "2026-08-29/S/w2",
      "2026-08-30/U/w3",
      "2026-08-31/M/w3",
    ]);

    const merges = cal.weekBlocks(rows, 2).map((b) => `A${b.firstRow}:A${b.lastRow}=${b.week}`);
    expect(merges).toEqual(["A2:A3=1", "A4:A9=2", "A10:A11=3"]);
  });

  it("gives a single-row week no merge, since only a merge anchor is writable", () => {
    // 2026-08-22 is a Saturday: it is the whole of week 1 on its own.
    const rows = build("2026-08-22", "2026-08-24");
    const blocks = cal.weekBlocks(rows, 2);
    expect(blocks[0]).toEqual({ week: 1, firstRow: 2, lastRow: 2 });
    expect(blocks[0].lastRow > blocks[0].firstRow).toBe(false);
  });

  it("falls back to counting weeks when weekStartDates does not cover the range", () => {
    // Range begins before the first known week start, so numbering must come
    // from the Sun-Sat roll rather than from a bogus index lookup.
    const rows = cal.buildCalendar({
      startKey: "2026-08-05",
      endKey: "2026-08-12",
      weekStartKeys: WEEK_START_DATES,
    });
    expect(rows[0].week).toBe(1);
    expect(rows.every((r) => Number.isInteger(r.week))).toBe(true);
    // 2026-08-08 is a Saturday, so the week rolls over immediately after it.
    const sat = rows.find((r) => r.dateKey === "2026-08-08");
    const sun = rows.find((r) => r.dateKey === "2026-08-09");
    expect(sun.week).toBe(sat.week + 1);
  });

  it("returns nothing when the range is inverted", () => {
    expect(build("2026-12-10", "2026-08-19")).toEqual([]);
  });
});

describe("examDateKey - timezone boundary (spec test 11)", () => {
  it("puts a 21:00Z exam on the next local day", () => {
    // Riyadh is UTC+3, so 2026-10-06T21:00Z is already 07-Oct locally. This is
    // the single highest-risk defect in the feature: getting it wrong shifts
    // every late-evening exam a day earlier.
    expect(cal.examDateKey(new Date("2026-10-06T21:00:00Z"))).toBe("2026-10-07");
  });

  it("leaves a UTC-midnight exam on its own day", () => {
    // This is how all existing rows are stored.
    expect(cal.examDateKey(new Date("2026-10-06T00:00:00.000Z"))).toBe("2026-10-06");
  });

  it("keeps an early-morning local exam on the same day", () => {
    expect(cal.examDateKey(new Date("2026-10-06T05:00:00Z"))).toBe("2026-10-06");
  });

  it("returns null for an unparseable value rather than a wrong date", () => {
    expect(cal.examDateKey("not a date")).toBeNull();
    expect(cal.examDateKey(null)).toBeNull();
  });
});

describe("blockedRuns", () => {
  const rows = build("2026-08-19", "2026-12-10");
  const runs = cal.blockedRuns({ calendarRows: rows, blockedDates: BLOCKED_DATES, firstBodyRow: 2 });

  it("finds the template's three grey bands at the template's rows", () => {
    expect(runs.map((r) => `${r.label} E${r.firstRow}:AG${r.lastRow}`)).toEqual([
      "Saudi National Day E31:AG34",
      "Midterm Break E54:AG59",
      "Autumn Break E82:AG85",
    ]);
  });

  it("treats a holiday spanning a Friday as one band, not two", () => {
    // Saudi National Day covers 22-26 Sep including Friday the 25th, which has
    // no row at all - the band must not split there.
    const saudi = runs[0];
    expect(saudi.dateKeys).toEqual(["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-26"]);
  });

  it("splits bands when the label changes on consecutive days", () => {
    const runs2 = cal.blockedRuns({
      calendarRows: build("2026-09-20", "2026-09-24"),
      blockedDates: { "2026-09-22": "Holiday A", "2026-09-23": "Holiday B" },
      firstBodyRow: 2,
    });
    expect(runs2.map((r) => r.label)).toEqual(["Holiday A", "Holiday B"]);
  });

  it("reports no bands for a term with no holidays (spec test 7)", () => {
    expect(cal.blockedRuns({ calendarRows: rows, blockedDates: {}, firstBodyRow: 2 })).toEqual([]);
  });
});

describe("resolveSheetRange", () => {
  it("prefers the teaching period read from calendarData.events", () => {
    const r = cal.resolveSheetRange({ term: TERM_261, examDateKeys: [] });
    expect(r).toMatchObject({
      startKey: "2026-08-19",
      endKey: "2026-12-10",
      source: "teaching-period",
    });
    expect(r.notes).toEqual([]);
  });

  it("falls back to the registered term dates when the events are missing", () => {
    const term = { ...TERM_261, calendarData: { ...TERM_261.calendarData, events: [] } };
    const r = cal.resolveSheetRange({ term, examDateKeys: [] });
    expect(r).toMatchObject({
      startKey: "2026-08-16",
      endKey: "2026-12-26",
      source: "registered-term",
    });
    expect(r.notes[0]).toMatch(/registered term dates/);
  });

  it("widens rather than dropping an exam booked outside the teaching period", () => {
    const r = cal.resolveSheetRange({ term: TERM_261, examDateKeys: ["2026-12-15"] });
    expect(r.endKey).toBe("2026-12-15");
    expect(r.notes[0]).toMatch(/Extended the sheet forward to 2026-12-15/);
  });

  it("does not widen past the registered term", () => {
    const r = cal.resolveSheetRange({ term: TERM_261, examDateKeys: ["2027-01-05"] });
    expect(r.endKey).toBe("2026-12-10");
    expect(r.notes).toEqual([]);
  });

  it("throws when the term has no usable dates at all", () => {
    expect(() => cal.resolveSheetRange({ term: { name: "999" }, examDateKeys: [] })).toThrow(
      /no usable startDate/
    );
  });
});

describe("resolveCounterWindow", () => {
  const rows = build("2026-08-19", "2026-12-10");

  it("spans the union of the configured exam windows, clamped to the calendar", () => {
    const w = cal.resolveCounterWindow({
      schedulingConfig: SCHEDULING_CONFIG,
      weekStartKeys: WEEK_START_DATES,
      calendarRows: rows,
    });
    // Weeks 5..17: week 5 starts 2026-09-13; week 18 would start 2026-12-13,
    // so the window ends at the calendar's own last day instead.
    expect(w).toMatchObject({ startKey: "2026-09-13", endKey: "2026-12-10", firstWeek: 5, lastWeek: 17 });
  });

  it("leaves column C blank rather than inventing a window", () => {
    expect(
      cal.resolveCounterWindow({ schedulingConfig: null, weekStartKeys: WEEK_START_DATES, calendarRows: rows })
    ).toBeNull();
    expect(
      cal.resolveCounterWindow({ schedulingConfig: { examWindows: {} }, weekStartKeys: WEEK_START_DATES, calendarRows: rows })
    ).toBeNull();
  });

  it("ignores malformed window entries instead of failing the export", () => {
    const w = cal.resolveCounterWindow({
      schedulingConfig: { examWindows: { major1: { startWeek: 6, endWeek: 8 }, junk: { startWeek: "x" } } },
      weekStartKeys: WEEK_START_DATES,
      calendarRows: rows,
    });
    expect(w).toMatchObject({ firstWeek: 6, lastWeek: 8 });
    expect(w.startKey).toBe("2026-09-20");
  });
});

describe("date key helpers", () => {
  it("round-trips a key through a UTC-midnight Date", () => {
    expect(cal.calendarKey(cal.fromKey("2026-08-19"))).toBe("2026-08-19");
  });

  it("crosses month and year boundaries when adding days", () => {
    expect(cal.addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(cal.addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(cal.addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("rejects anything that is not a YYYY-MM-DD key", () => {
    expect(() => cal.fromKey("19/08/2026")).toThrow(/Not a YYYY-MM-DD date/);
  });
});
