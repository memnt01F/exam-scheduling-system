/**
 * One-time import: reads test.bookings.json and replaces algorithm exam
 * entries in the bookings collection for term 261, phaseNumber 0.
 *
 * Run from the backend folder:
 *   node scripts/importBookings261.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Booking = require('../models/booking.model');
const AcademicTerm = require('../models/academicTerm.model');

const JSON_FILE = path.join('C:/Users/Lenovo/Downloads', 'test.bookings.json');

async function main() {
  await connectDB(process.env.MONGO_URL);
  console.log('Connected to MongoDB');

  // Find term 261
  const terms = await AcademicTerm.find();
  const term261 = terms.find(t => t.name && t.name.includes('261'));
  if (!term261) {
    console.error('Term 261 not found. Available terms:', terms.map(t => t.name));
    process.exit(1);
  }
  console.log(`Found term: ${term261.name} (${term261._id})`);

  // Cancel existing algorithm exams for term 261, phase 0
  const cancelled = await Booking.updateMany(
    { termId: term261._id, phaseNumber: 0 },
    { $set: { status: 'cancelled' } }
  );
  console.log(`Cancelled ${cancelled.modifiedCount} existing algorithm exams`);

  // Read JSON
  const raw = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  console.log(`Read ${raw.length} bookings from JSON`);

  // Map to our schema — strip the original _id so Mongo generates fresh ones
  const docs = raw.map(b => ({
    courseCode: String(b.courseCode).trim().toUpperCase(),
    examType: b.examType,
    examDate: new Date(b.examDate?.$date || b.examDate),
    level: b.level ?? null,
    maleProctors: b.maleProctors ?? 0,
    femaleProctors: b.femaleProctors ?? 0,
    createdBy: b.createdBy || 'Admin',
    status: 'pending',
    phaseNumber: 0,
    termId: term261._id,
    room: b.room || '',
    confirmedAt: null,
    confirmedBy: '',
    updatedBy: '',
  }));

  const created = await Booking.insertMany(docs);
  console.log(`Inserted ${created.length} bookings for term 261`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
