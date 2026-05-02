const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    examType: {
      type: String,
      required: true,
      trim: true,
      enum: ["Major 1", "Major 2", "Mid"],
      default: "Major 1",
    },
    examDate: { type: Date, required: true, index: true },
    level: { type: Number, required: true },
    maleProctors: { type: Number, default: 0 },
    femaleProctors: { type: Number, default: 0 },
    createdBy: { type: String, required: true },
    notes: { type: String },
    // Required by soft-cancel (DELETE route) and conflict detection queries.
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Uniqueness is per course + exam type.
bookingSchema.index({ courseCode: 1, examType: 1 }, { unique: true });

module.exports = mongoose.model("Booking", bookingSchema);
