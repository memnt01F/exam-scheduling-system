"use strict";

/**
 * A trimmed copy of the real Term-261 document, so the tests exercise the same
 * shapes production sees without needing a database connection.
 */

const WEEK_START_DATES = [
  "2026-08-16", "2026-08-23", "2026-08-30", "2026-09-06", "2026-09-13",
  "2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18",
  "2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22",
  "2026-11-29", "2026-12-06", "2026-12-13", "2026-12-20",
];

const BLOCKED_DATES = {
  "2026-09-22": "Saudi National Day",
  "2026-09-23": "Saudi National Day",
  "2026-09-24": "Saudi National Day",
  "2026-09-25": "Saudi National Day",
  "2026-09-26": "Saudi National Day",
  "2026-10-19": "Midterm Break",
  "2026-10-20": "Midterm Break",
  "2026-10-21": "Midterm Break",
  "2026-10-22": "Midterm Break",
  "2026-10-23": "Midterm Break",
  "2026-10-24": "Midterm Break",
  "2026-10-25": "Midterm Break",
  "2026-11-21": "Autumn Break",
  "2026-11-22": "Autumn Break",
  "2026-11-23": "Autumn Break",
  "2026-11-24": "Autumn Break",
};

const SOFT_BLOCKED_DATES = {
  "2026-10-01": "(NPSD Forum - KIKX)",
  "2026-10-02": "(NPSD Forum - KIKX)",
  "2026-11-06": "Qiyas Exam",
};

const EVENTS = [
  {
    summary: "REGISTRATION CONFIRMATION through KFUPM Portal",
    description: "REGISTRATION CONFIRMATION through KFUPM Portal; Classes begin",
    startDate: "2026-08-19",
    endDate: "2026-08-19",
  },
  {
    summary: "Last Day of classes for the term",
    description: "Last Day of classes for the term",
    startDate: "2026-12-10",
    endDate: "2026-12-10",
  },
];

const TERM_261 = {
  _id: "6a4b68335734030b0332b2f8",
  name: "261",
  startDate: "2026-08-16",
  endDate: "2026-12-26",
  status: "active",
  isActive: true,
  calendarData: {
    weekStartDates: WEEK_START_DATES,
    blockedDates: BLOCKED_DATES,
    softBlockedDates: SOFT_BLOCKED_DATES,
    termStart: "2026-08-16",
    termEnd: "2026-12-26",
    events: EVENTS,
  },
};

const SCHEDULING_CONFIG = {
  scope: "global",
  examWindows: {
    major1: { startWeek: 5, endWeek: 9 },
    major2: { startWeek: 10, endWeek: 17 },
    midterm: { startWeek: 7, endWeek: 17 },
    major3: { startWeek: 13, endWeek: 15 },
  },
};

/** The 17 column-A week merges present in the real template workbook. */
const TEMPLATE_WEEK_MERGES = [
  "A2:A4=1", "A5:A10=2", "A11:A16=3", "A17:A22=4", "A23:A28=5", "A29:A34=6",
  "A35:A40=7", "A41:A46=8", "A47:A52=9", "A53:A58=10", "A59:A64=11",
  "A65:A70=12", "A71:A76=13", "A77:A82=14", "A83:A88=15", "A89:A94=16",
  "A95:A99=17",
];

/**
 * Just enough of the mongo query language to make the fake honest: the export's
 * phase/status filters are applied for real, so the tests exercise the actual
 * predicates rather than trusting a hand-picked subset.
 *
 * Supports the operators the export uses - $lte, $gt, $in, $nin - plus plain
 * equality. `termId` is ignored: the fixture is a single-term dataset.
 */
function matchesQuery(doc, query = {}) {
  return Object.entries(query).every(([field, cond]) => {
    if (field === "termId") return true;
    const value = doc[field];
    if (cond === null || typeof cond !== "object" || Array.isArray(cond)) {
      return value === cond;
    }
    return Object.entries(cond).every(([op, operand]) => {
      switch (op) {
        case "$lte": return value <= operand;
        case "$lt": return value < operand;
        case "$gte": return value >= operand;
        case "$gt": return value > operand;
        case "$in": return operand.includes(value);
        case "$nin": return !operand.includes(value);
        default: throw new Error(`fakeDb: unsupported operator "${op}"`);
      }
    });
  });
}

/**
 * A stand-in for the mongo Db handle. Only the three collections the export
 * touches are implemented, and the bookings queries are matched for real so the
 * phase/status filter is genuinely under test.
 */
function fakeDb({ term = TERM_261, exams = [], config = SCHEDULING_CONFIG } = {}) {
  return {
    collection(name) {
      if (name === "academicterms") return { findOne: async () => term };
      if (name === "schedulingconfigs") return { findOne: async () => config };
      if (name === "bookings") {
        return {
          aggregate(pipeline) {
            const match = (pipeline.find((s) => s.$match) || {}).$match || {};
            return { toArray: async () => exams.filter((e) => matchesQuery(e, match)) };
          },
          countDocuments: async (query = {}) =>
            exams.filter((e) => matchesQuery(e, query)).length,
        };
      }
      throw new Error(`fakeDb: unexpected collection "${name}"`);
    },
  };
}

/** Build a booking document the way the real collection stores one. */
function exam({
  courseCode,
  examType = "Major 1",
  date,
  department = "Mathematics",
  phaseNumber = 0,
  status = "confirmed",
}) {
  return {
    courseCode,
    examType,
    // Real data is written at UTC midnight; pass an ISO string to override.
    examDate: date instanceof Date ? date : new Date(`${date}T00:00:00.000Z`),
    phaseNumber,
    status,
    department,
  };
}

module.exports = {
  TERM_261,
  SCHEDULING_CONFIG,
  WEEK_START_DATES,
  BLOCKED_DATES,
  SOFT_BLOCKED_DATES,
  TEMPLATE_WEEK_MERGES,
  fakeDb,
  exam,
};
