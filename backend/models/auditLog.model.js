const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    user: { type: String, required: true },
    role: { type: String, default: "coordinator" },
    courseCode: { type: String, uppercase: true, trim: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
    details: { type: String },
    metadata: { type: Object },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
