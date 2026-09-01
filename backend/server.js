require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const Booking = require("./models/booking.model");
const bookingRoutes = require("./routes/booking.routes");
const phaseRoutes = require("./routes/phase.routes");
const auditLogRoutes = require("./routes/auditLog.routes");
const userRoutes = require("./routes/user.routes");
const courseRoutes = require("./routes/course.routes");
const academicTermRoutes = require("./routes/academicTerm.routes");
const preferenceRoutes = require("./routes/preference.routes");
const courseOfferingRoutes = require("./routes/courseOffering.routes");
const enrollmentRoutes = require("./routes/enrollment.routes");
const courseAssignmentRoutes = require("./routes/courseAssignment.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const scheduleExportRoutes = require("./routes/scheduleExport.routes");
const { verifyTemplate } = require("./services/scheduleExportService");
const examGroupRoutes = require("./routes/examGroup.routes");
const conflictRoutes = require("./routes/conflicts.routes");

const app = express();
app.use(cors({
  origin: [
    "http://localhost:8080",
    "https://kfupm-exam-scheduling-42ia.onrender.com"
  ]
}));
app.use(express.json());

app.get("/", (_req, res) => res.send("Exam Scheduling Backend is running"));

app.use("/api/bookings", bookingRoutes);
app.use("/api/phases", phaseRoutes);
app.use("/api/auditlogs", auditLogRoutes);
app.use("/api/users", userRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/terms", academicTermRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/course-offerings", courseOfferingRoutes);
app.use("/api/enrollments", enrollmentRoutes);
app.use("/api/course-assignments", courseAssignmentRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/schedule", scheduleExportRoutes);
app.use("/api/exam-groups", examGroupRoutes);
app.use("/api/conflicts", conflictRoutes);

const PORT = process.env.PORT || 5000;

connectDB(process.env.MONGO_URL)
  .then(() => {
    // Drop the old unique index that blocks algorithm exams from coexisting
    // with Phase 2 bookings for the same course+examType. No-ops if already gone.
    Booking.collection.dropIndex('courseCode_1_examType_1').catch(() => {});

    // Check the Excel export template up front. A missing or unreadable asset
    // is reported here rather than on a user's click - but it only disables the
    // export, so it must not stop the rest of the API from serving.
    verifyTemplate().then((r) => {
      if (r.ok) console.log(`[schedule-export] ${r.message}`);
      else console.error(`[schedule-export] DISABLED - ${r.message}`);
    });

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });
