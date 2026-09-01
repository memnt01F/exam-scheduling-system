/**
 * Integration check for the Excel schedule export, run against the LIVE database.
 *
 * The vitest suite covers the logic with a stubbed Db; this script is the
 * end-to-end confidence check - it builds a real workbook, writes it to disk so
 * it can be opened in Excel beside the institutional sample, and asserts the
 * output still matches the template row for row.
 *
 *   npm run verify:export -- <output-dir>
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const svc = require("../services/scheduleExportService");

const OUT_DIR = process.argv[2] || ".";
let fails = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}${extra ? "  -> " + extra : ""}`);
  if (!cond) fails++;
};

const fillOf = (cell) => (cell.fill && cell.fill.fgColor ? cell.fill.fgColor.argb : null);

function dateKeyOf(cell) {
  const v = cell.value;
  if (typeof v === "number") {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  return null;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;

  console.log("=== boot check ===");
  const v = await svc.verifyTemplate();
  ok(v.ok, "verifyTemplate()", v.message);

  const tpl = new ExcelJS.Workbook();
  await tpl.xlsx.readFile(svc.TEMPLATE_PATH);
  const tws = tpl.worksheets[0];

  console.log("\n=== build ===");
  const t0 = Date.now();
  const res = await svc.buildScheduleExport({
    termId: "261",
    now: new Date("2026-08-25T11:32:00.000Z"),
  });
  console.log("  stats:", JSON.stringify(res.stats));
  console.log("  filename:", res.filename);
  console.log("  anomalies:", res.anomalies.length, JSON.stringify(res.anomalies.slice(0, 4)));
  console.log("  bytes:", res.buffer.length, "in", Date.now() - t0, "ms");

  const out = path.join(OUT_DIR, "export_all.xlsx");
  fs.writeFileSync(out, res.buffer);
  console.log("  written to:", out);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.buffer);
  const ws = wb.getWorksheet("Term-261");
  ok(Boolean(ws), "sheet named Term-261");

  console.log("\n=== scope: everything except cancelled/rejected ===");
  const termDoc = await db.collection("academicterms").findOne({ name: "261" });
  const totalInTerm = await db.collection("bookings").countDocuments({ termId: termDoc._id });
  const ignored = await db.collection("bookings").countDocuments({
    termId: termDoc._id,
    status: { $in: ["cancelled", "rejected"] },
  });
  console.log(`  DB: ${totalInTerm} bookings, ${ignored} cancelled/rejected`);
  ok(res.stats.examsInTerm === totalInTerm, "examsInTerm matches the DB", String(res.stats.examsInTerm));
  ok(res.stats.excludedByStatus === ignored, "excludedByStatus matches the DB", String(res.stats.excludedByStatus));
  ok(res.stats.examsPlaced === totalInTerm - ignored, "every eligible booking was written", `${res.stats.examsPlaced} of ${totalInTerm - ignored}`);
  ok(res.stats.examsSkipped === 0, "nothing was skipped", String(res.stats.examsSkipped));
  ok(
    res.stats.examsPlaced + res.stats.examsSkipped + res.stats.excludedByStatus === res.stats.examsInTerm,
    "counts reconcile against the term total"
  );
  console.log("  phases swept up:", res.stats.phaseBreakdown);

  console.log("\n=== structure ===");
  ok(res.stats.calendarRows === 98, "98 calendar rows", String(res.stats.calendarRows));
  ok(dateKeyOf(ws.getCell(2, 4)) === "2026-08-19", "first date 2026-08-19", dateKeyOf(ws.getCell(2, 4)));
  ok(dateKeyOf(ws.getCell(99, 4)) === "2026-12-10", "last date 2026-12-10", dateKeyOf(ws.getCell(99, 4)));

  let dMismatch = 0;
  for (let r = 2; r <= 99; r++) {
    if (dateKeyOf(ws.getCell(r, 4)) !== dateKeyOf(tws.getCell(r, 4))) dMismatch++;
  }
  ok(dMismatch === 0, "column D matches template row-for-row", `${dMismatch} mismatches`);

  let lMismatch = 0;
  for (let r = 2; r <= 99; r++) {
    if (String(ws.getCell(r, 2).value) !== String(tws.getCell(r, 2).value)) lMismatch++;
  }
  ok(lMismatch === 0, "column B day letters match template", `${lMismatch} mismatches`);

  const merges = Object.keys(ws._merges || {}).filter((m) => m.startsWith("A")).sort();
  const tMerges = Object.keys(tws._merges || {}).filter((m) => m.startsWith("A")).sort();
  ok(JSON.stringify(merges) === JSON.stringify(tMerges), "17 column-A week merges match template", `${merges.length} vs ${tMerges.length}`);

  console.log("\n=== style preservation ===");
  ok(fillOf(ws.getCell(1, 5)) === "FFEEECE1", "row 1 fill FFEEECE1", fillOf(ws.getCell(1, 5)));
  ok(fillOf(ws.getCell(31, 10)) === "FFD9D9D9", "closed-day cell FFD9D9D9", fillOf(ws.getCell(31, 10)));
  ok(fillOf(ws.getCell(54, 20)) === "FFD9D9D9", "Midterm Break cell FFD9D9D9", fillOf(ws.getCell(54, 20)));
  ok(fillOf(ws.getCell(85, 33)) === "FFD9D9D9", "Autumn Break AG cell FFD9D9D9", fillOf(ws.getCell(85, 33)));
  for (const c of [1, 4, 5, 8, 33]) {
    const a = ws.getColumn(c).width;
    const b = tws.getColumn(c).width;
    ok(a === b, `column ${ws.getColumn(c).letter} width`, `${a} vs template ${b}`);
  }
  ok(
    ws.getCell(10, 4).numFmt === tws.getCell(10, 4).numFmt,
    "column D numFmt matches template",
    `${ws.getCell(10, 4).numFmt} vs ${tws.getCell(10, 4).numFmt}`
  );
  const bf = ws.getCell(10, 6).font;
  ok(bf && bf.name === "Calibri" && bf.size === 8, "body font 8pt Calibri", JSON.stringify(bf));
  const bb = ws.getCell(10, 6).border;
  ok(bb && bb.top && bb.top.style === "thin", "body cell thin borders");
  ok(ws.getCell(10, 1).font && ws.getCell(10, 1).font.bold === true, "column A bold");
  ok(ws.getCell(10, 2).font && ws.getCell(10, 2).font.bold === true, "column B bold");

  console.log("\n=== holiday labels and events ===");
  for (const [row, label] of [[31, "Saudi National Day"], [54, "Midterm Break"], [82, "Autumn Break"]]) {
    ok(String(ws.getCell(row, 5).value || "").includes(label), `"${label}" label written`, `row ${row}`);
  }
  ok(String(ws.getCell(39, 33).value || "").includes("NPSD"), "AG 2026-10-01 = NPSD Forum", String(ws.getCell(39, 33).value));
  ok(fillOf(ws.getCell(39, 33)) === "FFDBEEF4", "AG event fill FFDBEEF4", fillOf(ws.getCell(39, 33)));

  console.log("\n=== Excel-compatibility guards ===");
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(res.buffer);
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
  ok(!/<definedName/.test(workbookXml), "no defined names (exceljs mangles Print_Area)");
  ok(/<dimension ref="A1:AG99"\/>/.test(sheetXml), "dimension stops at AG99");
  ok(!/<selection/.test(sheetXml), "no stale selection copied from the template");
  ok(!/\$\$/.test(workbookXml), "no mangled cell references");

  console.log("\n=== export log sheet ===");
  ok(Boolean(wb.getWorksheet("Export Log")), "Export Log sheet present");

  console.log("\n=== idempotence ===");
  const cellsOf = async (buf) => {
    const w = new ExcelJS.Workbook();
    await w.xlsx.load(buf);
    const s = w.getWorksheet("Term-261");
    const outCells = [];
    for (let r = 1; r <= 99; r++) for (let c = 1; c <= 33; c++) outCells.push(String(s.getCell(r, c).value));
    return outCells.join("");
  };
  const a = await svc.buildScheduleExport({ termId: "261", now: new Date("2026-08-25T11:32:00Z"), includeLogSheet: false });
  const b = await svc.buildScheduleExport({ termId: "261", now: new Date("2026-08-25T11:32:00Z"), includeLogSheet: false });
  ok((await cellsOf(a.buffer)) === (await cellsOf(b.buffer)), "two exports produce identical cell values");

  console.log("\n=== error paths ===");
  try {
    await svc.buildScheduleExport({ termId: "999" });
    ok(false, "unknown term -> 404");
  } catch (e) {
    ok(e.status === 404, "unknown term -> 404", `${e.status}: ${e.message}`);
  }

  await mongoose.disconnect();
  console.log(`\n${fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECK(S) FAILED"}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
