"use strict";

/**
 * GET /api/schedule/export?termId=<id|name>
 *
 * Streams the exam-calendar workbook for the term.
 *
 * There is no phase filter. `phaseNumber` is not reliable enough to gate an
 * export on - a booking sitting in the wrong phase would silently drop out of
 * the sheet, and a missing exam is worse than an extra one. Every booking in the
 * term is included except cancelled and rejected. A `phase` query parameter is
 * accepted and ignored so old links keep working.
 *
 * No auth guard: this API has none anywhere (no tokens, no sessions, no
 * credentialed fetches), and an export must not be *harder* to reach than the
 * Schedule Management page that renders the same data. If auth is added later,
 * this route belongs behind the same middleware as GET /api/bookings.
 */

const express = require("express");
const router = express.Router();

const { buildScheduleExport, ExportError } = require("../services/scheduleExportService");

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

router.get("/export", async (req, res) => {
  const termRef = String(req.query.termId || req.query.termCode || "").trim();
  if (!termRef) {
    return res.status(400).json({ message: "termId is required." });
  }

  try {
    const { buffer, filename, anomalies, stats } = await buildScheduleExport({
      termId: termRef,
    });

    const errors = anomalies.filter((a) => a.severity === "error").length;
    const warnings = anomalies.filter((a) => a.severity === "warning").length;

    // Anomalies are never swallowed: they ride along on the Export Log sheet,
    // and they are logged here with term, phase and totals.
    // Spell out where every booking went, so a written count can always be
    // reconciled against the term's booking total rather than guessed at.
    console.log(
      `[schedule-export] term=${stats.termName} (all phases) ` +
        `range=${stats.rangeStart}..${stats.rangeEnd} (${stats.rangeSource}) ` +
        `rows=${stats.calendarRows} cells=${stats.cellsWritten} | ` +
        `bookings in term ${stats.examsInTerm} = ` +
        `${stats.examsPlaced} written + ${stats.examsSkipped} skipped + ` +
        `${stats.excludedByStatus} cancelled/rejected | ` +
        `[${stats.phaseBreakdown}] | errors=${errors} warnings=${warnings}`
    );
    for (const a of anomalies) {
      if (a.severity === "info") continue;
      console.warn(
        `[schedule-export] ${a.severity} ${a.type}: ${a.detail}` +
          (a.courseCode ? ` (${a.courseCode} ${a.examType} ${a.dateKey})` : "")
      );
    }

    // CORS: without this the browser hides Content-Disposition, and the client
    // would have to rebuild the filename itself and get it subtly wrong.
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, Content-Length, X-Export-Anomalies, X-Export-Summary"
    );
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("X-Export-Anomalies", String(errors + warnings));
    res.setHeader(
      "X-Export-Summary",
      `exams=${stats.examsPlaced};cells=${stats.cellsWritten};errors=${errors};warnings=${warnings}`
    );
    return res.status(200).end(buffer);
  } catch (err) {
    if (err instanceof ExportError) {
      if (err.status >= 500) console.error(`[schedule-export] ${err.message}`);
      return res.status(err.status).json({ message: err.message });
    }
    console.error("[schedule-export] unexpected failure:", err);
    return res.status(500).json({ message: `Export failed: ${err.message}` });
  }
});

module.exports = router;
