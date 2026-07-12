/**
 * One-time seed: reads output_schedule_261.xlsx and inserts algorithm exam
 * entries into the bookings collection for term 261, phaseNumber 0.
 *
 * Run from the backend folder:
 *   node scripts/seedSchedule261.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const connectDB = require('../config/db');
const Booking = require('../models/booking.model');
const AcademicTerm = require('../models/academicTerm.model');

const EXAM_FILE = 'C:/Users/Lenovo/Downloads/output_schedule_261.xlsx';
const PHASE_NUMBER = 0;

const EXAM_TYPE_MAP = {
  M1: 'Major 1',
  M2: 'Major 2',
  M3: 'Major 3',
  MIDTERM: 'Mid',
};

const MONTH_MAP = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseDate(str) {
  const [day, mon, year] = str.split('-');
  return new Date(Date.UTC(parseInt(year), MONTH_MAP[mon], parseInt(day)));
}

async function main() {
  await connectDB(process.env.MONGO_URL);
  console.log('Connected to MongoDB');

  // Drop the old unique index if still present
  try {
    await Booking.collection.dropIndex('courseCode_1_examType_1');
    console.log('Dropped old unique index');
  } catch {
    console.log('Unique index already dropped (or never existed)');
  }

  // Find term 261
  const terms = await AcademicTerm.find();
  const term261 = terms.find(t => t.name && t.name.includes('261'));
  if (!term261) {
    console.error('Term 261 not found. Available terms:', terms.map(t => t.name));
    process.exit(1);
  }
  console.log(`Found term: ${term261.name} (${term261._id})`);

  // Cancel any existing algorithm exams for this term + phase
  const cancelled = await Booking.updateMany(
    { termId: term261._id, phaseNumber: PHASE_NUMBER },
    { $set: { status: 'cancelled' } }
  );
  console.log(`Cancelled ${cancelled.modifiedCount} existing algorithm exams`);

  // Read Excel
  const wb = XLSX.readFile(EXAM_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);
  console.log(`Read ${rows.length} rows from Excel`);

  // Build booking documents
  const skipped = [];
  const docs = [];
  for (const row of rows) {
    const examType = EXAM_TYPE_MAP[row.exam];
    if (!examType) {
      skipped.push(`${row.course} ${row.exam}`);
      continue;
    }
    docs.push({
      courseCode: String(row.course).trim().toUpperCase(),
      examType,
      examDate: parseDate(row.date),
      phaseNumber: PHASE_NUMBER,
      termId: term261._id,
      room: row.room || '',
      status: 'pending',
    });
  }

  if (skipped.length) {
    console.log(`Skipped ${skipped.length} rows with unrecognised exam type:`, skipped);
  }

  const created = await Booking.insertMany(docs);
  console.log(`Inserted ${created.length} algorithm exams into bookings`);
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
