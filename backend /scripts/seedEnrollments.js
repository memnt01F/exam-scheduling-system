require("dotenv").config();
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const connectDB = require("../config/db");
const Enrollment = require("../models/enrollment.model");

const FILE_PATH = path.resolve(__dirname, "../data/MidTermExamsRandomizedData.xlsx");

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`[seed] File not found: ${FILE_PATH}`);
    console.error("       Place MidTermExamsRandomizedData.xlsx in backend/data/");
    process.exit(1);
  }

  await connectDB(process.env.MONGO_URL);

  const wb = XLSX.readFile(FILE_PATH);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
  console.log(`[seed] Read ${rows.length} rows from ${sheetName}`);

  const docs = [];
  for (const row of rows) {
    const studentId = pick(row, ["studentId", "StudentID", "Student ID", "student_id", "id", "ID", "ID#", "Id#"]);

    // courseCode may be a single column, OR built from SUBJ + COURSE (e.g. "ICS" + 104 → "ICS104").
    let courseCode = pick(row, ["courseCode", "CourseCode", "Course Code", "course_code", "course", "Course"]);
    if (!courseCode) {
      const subj = pick(row, ["SUBJ", "Subj", "subj", "Subject", "subject"]);
      const num = pick(row, ["COURSE", "Course", "course", "CourseNumber", "Course Number", "course_number"]);
      if (subj && num !== undefined && num !== null) {
        courseCode = `${String(subj).trim()}${String(num).trim()}`;
      }
    }

    if (!studentId || !courseCode) continue;
    docs.push({
      studentId: String(studentId).trim(),
      courseCode: String(courseCode).replace(/\s+/g, "").toUpperCase(),
      courseName: pick(row, ["courseName", "CourseName", "Course Name"]),
      level: pick(row, ["level", "Level"]),
      section: pick(row, ["section", "Section", "SECTION", "SECTION #", "Section #"]),
      term: pick(row, ["term", "Term", "semester", "Semester"]),
    });
  }


  console.log(`[seed] Parsed ${docs.length} valid enrollment rows`);

  await Enrollment.deleteMany({});
  console.log("[seed] Cleared existing Enrollment collection");

  const BATCH = 5000;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    await Enrollment.insertMany(chunk, { ordered: false });
    inserted += chunk.length;
    console.log(`[seed] Inserted ${inserted}/${docs.length}`);
  }

  console.log(`Seeded ${inserted} enrollment records`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
