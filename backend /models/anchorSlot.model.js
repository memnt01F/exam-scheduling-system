const mongoose = require("mongoose");

const anchorSlotSchema = new mongoose.Schema(
  {
    termId: { type: String, default: "current" },
    courseCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    courseName: { type: String },
    examType: { type: String, required: true },
    week: { type: Number, required: true },
    date: { type: String, required: true }, // human-readable label saved by UI
    bookingStatus: { type: String, default: "booked" },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

anchorSlotSchema.index({ termId: 1, courseCode: 1 }, { unique: true });

module.exports = mongoose.model("AnchorSlot", anchorSlotSchema);
