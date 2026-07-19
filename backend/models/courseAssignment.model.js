const mongoose = require("mongoose");

const courseAssignmentSchema = new mongoose.Schema(
  {
    courseCode:    { type: String, required: true, uppercase: true, trim: true, unique: true },
    coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedBy:    { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CourseAssignment", courseAssignmentSchema);
