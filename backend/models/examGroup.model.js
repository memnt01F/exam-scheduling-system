const mongoose = require("mongoose");

const examGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", required: true },
    courseCodes: { type: [String], required: true },
  },
  { timestamps: true }
);

examGroupSchema.index({ termId: 1 });

module.exports = mongoose.model("ExamGroup", examGroupSchema, "examgroups");
