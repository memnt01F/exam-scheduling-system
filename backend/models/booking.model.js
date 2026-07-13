const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    examType: {
      type: String,
      required: true,
      trim: true,
      enum: ["Major 1", "Major 2", "Major 3", "Mid"],
      default: "Major 1",
    },
    examDate: { type: Date, required: true, index: true },
    // Phase 2 manual booking fields (optional for algorithm exams)
    level: { type: Number },
    maleProctors: { type: Number, default: 0 },
    femaleProctors: { type: Number, default: 0 },
    createdBy: { type: String },
    notes: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    // Algorithm-generated exam fields (phaseNumber 0 or 1; 2 = Phase 2 manual booking)
    phaseNumber: { type: Number, default: 2 },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", default: null },
    room: { type: String, default: "" },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index for algorithm exam lookups by term + phase
bookingSchema.index({ termId: 1, phaseNumber: 1 });

// NOTE: The old unique index { courseCode: 1, examType: 1 } must be dropped from
// MongoDB Atlas manually before algorithm exams are inserted. Run in Atlas shell:
//   db.bookings.dropIndex("courseCode_1_examType_1")
// Duplicate-guard for Phase 2 bookings is enforced in application code instead.

module.exports = mongoose.model("Booking", bookingSchema);
