const mongoose = require("mongoose");

const phaseSchema = new mongoose.Schema(
  {
    phaseNumber: { type: Number, required: true },
    name: { type: String, required: true },
    description: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    targetLevels: { type: [Number], default: [] },
    targetTermId: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicTerm", default: null },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

// Each term has its own set of phase numbers — uniqueness is per (phaseNumber, targetTermId)
phaseSchema.index({ phaseNumber: 1, targetTermId: 1 }, { unique: true });

module.exports = mongoose.model("Phase", phaseSchema);
