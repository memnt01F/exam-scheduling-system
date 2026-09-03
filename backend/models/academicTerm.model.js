const mongoose = require("mongoose");

const academicTermSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true },   // YYYY-MM-DD
    isActive: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "upcoming", "past"],
      default: "upcoming",
    },
    calendarData: {
      type: Object,
      default: undefined,
    },
    // Index of scheduler runs, written by the Python service
    // (schudeler-API/scheduler/runlog.py) as
    //   solverLogs: { phase0: [entry, ...], phase1: [...] }
    // Each entry is self-describing - runKey, logId, termId, termName,
    // phaseNumber, status, counts - so it can be read without a join, and it
    // points at the full record in the `solverrunlogs` collection
    // (models/solverRunLog.model.js).
    //
    // Declared here so Mongoose knows the field exists. It is only ever
    // appended to, by Python, with a $push. The PUT /api/terms/:id handler
    // uses a field allowlist that omits it, so term edits cannot clobber it.
    solverLogs: {
      type: Object,
      default: undefined,
    },
    createdBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AcademicTerm", academicTermSchema);
