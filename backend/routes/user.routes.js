/**
 * User routes — CRUD with audit logging.
 *
 * Every new user gets the fixed default password: kfupm2026
 * Hashed with bcrypt before storing. Login is handled by POST /api/users/login.
 */
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/user.model");
const AuditLog = require("../models/auditLog.model");

const router = express.Router();

const FIXED_PASSWORD = "kfupm2026";

/**
 * POST /api/users/set-passwords
 * Adds the default password to any existing users that don't have one yet.
 * Safe to call multiple times — only updates users missing a password.
 */
router.post("/set-passwords", async (_req, res) => {
  try {
    const hash = await bcrypt.hash(FIXED_PASSWORD, 10);
    const result = await User.updateMany(
      { password: { $exists: false } },
      { $set: { password: hash } }
    );
    res.json({
      message: `Updated ${result.modifiedCount} user(s) with default password`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * POST /api/users/login
 * Body: { email, password }
 * Returns: { user: { id, name, email, role, department, assignedCourses } }
 *
 * No JWT for now — frontend stores the user object in memory (AuthContext).
 * When KFUPM SSO is ready, replace the bcrypt check here only.
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Explicitly select password (select:false hides it by default)
    const user = await User.findOne({
      email: String(email).toLowerCase().trim(),
      status: "active",
    }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const match = await bcrypt.compare(String(password), user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Return user without the password field
    res.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        assignedCourses: user.assignedCourses,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/** GET /api/users */
router.get("/", async (_req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST /api/users — create a new user.
 * Password is always set to FIXED_PASSWORD (kfupm2026), hashed with bcrypt.
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, role, department, assignedCourses, status, createdBy } = req.body || {};
    if (!name || !email || !role) {
      return res.status(400).json({ message: "name, email, and role are required" });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(FIXED_PASSWORD, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      department: department || "",
      assignedCourses: Array.isArray(assignedCourses) ? assignedCourses : [],
      status: status || "active",
      createdBy: createdBy || "admin",
    });

    await AuditLog.create({
      action: "CREATE_USER",
      user: createdBy || "admin",
      role: "admin",
      details: `Created user ${user.name} (${user.role})`,
    });

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** PUT /api/users/:id */
router.put("/:id", async (req, res) => {
  try {
    const allowed = ["name", "email", "role", "department", "assignedCourses", "status"];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];

    const before = await User.findById(req.params.id);
    if (!before) return res.status(404).json({ message: "User not found" });

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });

    await AuditLog.create({
      action: "UPDATE_USER",
      user: req.body?.updatedBy || "admin",
      role: "admin",
      details: `Updated user ${user.name}: ${Object.keys(update).join(", ")}`,
      metadata: { before: before.toObject(), after: user.toObject() },
    });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/** DELETE /api/users/:id — soft-delete unless ?hard=true */
router.delete("/:id", async (req, res) => {
  try {
    const hard = String(req.query.hard || "").toLowerCase() === "true";
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (hard) {
      await user.deleteOne();
    } else {
      user.status = "inactive";
      await user.save();
    }

    await AuditLog.create({
      action: "DELETE_USER",
      user: req.body?.deletedBy || "admin",
      role: "admin",
      details: `${hard ? "Deleted" : "Deactivated"} user ${user.name}`,
    });

    res.json({ message: hard ? "User deleted" : "User deactivated", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
