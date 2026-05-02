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
    createdBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AcademicTerm", academicTermSchema);
