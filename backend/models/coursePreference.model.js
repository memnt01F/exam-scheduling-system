const mongoose = require("mongoose");

const coursePreferenceSchema = new mongoose.Schema(
  {
    courseCode: { type: String, required: true, uppercase: true, trim: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", required: true },
    submittedBy: { type: String, required: true },
    examType: {
      type: String,
      enum: ["Midterm", "Two Majors", "Three Majors", null],
      default: null,
    },
    major1Weeks: { type: [Number], default: [] },
    major2Weeks: { type: [Number], default: [] },
    midtermWeeks: { type: [Number], default: [] },
    preferredDays: { type: [String], default: [] },
    unpreferredDays: { type: [String], default: [] },
    comments: { type: String, default: "" },
    status: {
      type: String,
      enum: ["not_started", "draft", "submitted", "scheduled"],
      default: "not_started",
    },
    submittedAt: { type: Date, default: null },
    editedBy: { type: String, default: null },
  },
  { timestamps: true }
);

// One preference document per course per term
coursePreferenceSchema.index({ courseCode: 1, termId: 1 }, { unique: true });

module.exports = mongoose.model("CoursePreference", coursePreferenceSchema);
