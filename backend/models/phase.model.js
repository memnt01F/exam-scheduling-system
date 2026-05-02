const mongoose = require("mongoose");

const phaseSchema = new mongoose.Schema(
  {
    phaseNumber: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    targetLevels: { type: [Number], default: [] },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Phase", phaseSchema);
