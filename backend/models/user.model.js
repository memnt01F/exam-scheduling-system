const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // never returned in GET /api/users
    },
    role: {
      type: String,
      enum: ["admin", "committee", "coordinator"],
      required: true,
    },
    department: { type: String, default: "" },
    assignedCourses: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    createdBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
