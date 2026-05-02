require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const bookingRoutes = require("./routes/booking.routes");
const phaseRoutes = require("./routes/phase.routes");
const auditLogRoutes = require("./routes/auditLog.routes");
const userRoutes = require("./routes/user.routes");
const courseRoutes = require("./routes/course.routes");
const academicTermRoutes = require("./routes/academicTerm.routes");
const anchorSlotRoutes = require("./routes/anchorSlot.routes");

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
app.use("/api/anchors", anchorSlotRoutes);

const PORT = process.env.PORT || 5000;

connectDB(process.env.MONGO_URL)
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  });
