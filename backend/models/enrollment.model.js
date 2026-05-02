const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true, trim: true },
    courseCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    courseName: { type: String },
    level: { type: Number },
    section: { type: String },
    term: { type: String },
  },
  { timestamps: true }
);

enrollmentSchema.index({ studentId: 1, courseCode: 1 });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
