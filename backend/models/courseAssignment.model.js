const mongoose = require("mongoose");

const courseAssignmentSchema = new mongoose.Schema(
  {
    courseCode:    { type: String, required: true, uppercase: true, trim: true, index: true },
    coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    termId:        { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", required: true },
    assignedBy:    { type: String, default: "" },
  },
  { timestamps: true }
);

// One coordinator per course per term
courseAssignmentSchema.index({ courseCode: 1, termId: 1 }, { unique: true });

module.exports = mongoose.model("CourseAssignment", courseAssignmentSchema);
