require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/user.model");

const SEED_USERS = [
  {
    name: "Admin",
    email: "admin@kfupm.edu.sa",
    password: "password",
    role: "admin",
    department: "",
    assignedCourses: [],
    createdBy: "seed",
  },
  {
    name: "Dr. Fatima Al-Otaibi",
    email: "falotaibi@kfupm.edu.sa",
    password: "kfupm2026",
    role: "committee",
    department: "Information & Computer Science",
    assignedCourses: [],
    createdBy: "seed",
  },
  {
    name: "Dr. Nasser Al-Mutairi",
    email: "nmutairi@kfupm.edu.sa",
    password: "kfupm2026",
    role: "committee",
    department: "Information & Computer Science",
    assignedCourses: [],
    createdBy: "seed",
  },
  {
    name: "Dr. Ahmed Al-Rashid",
    email: "arashid@kfupm.edu.sa",
    password: "kfupm2026",
    role: "coordinator",
    department: "Information & Computer Science",
    assignedCourses: [],
    createdBy: "seed",
  },
  {
    name: "Dr. Khalid Al-Dossary",
    email: "kdossary@kfupm.edu.sa",
    password: "kfupm2026",
    role: "coordinator",
    department: "Information & Computer Science",
    assignedCourses: [],
    createdBy: "seed",
  },
  {
    name: "Dr. Sara Al-Zahrani",
    email: "szahrani@kfupm.edu.sa",
    password: "kfupm2026",
    role: "coordinator",
    department: "Information & Computer Science",
    assignedCourses: [],
    createdBy: "seed",
  },
  {
    name: "Dr. Layla Al-Qahtani",
    email: "lqahtani@kfupm.edu.sa",
    password: "kfupm2026",
    role: "coordinator",
    department: "Information & Computer Science",
    assignedCourses: [],
    createdBy: "seed",
  },
  {
    name: "H. Jamaan",
    email: "hjamaan@kfupm.edu.sa",
    password: "kfupm2026",
    role: "coordinator",
    department: "Information & Computer Science",
    assignedCourses: [],
    createdBy: "seed",
  },
];

const SALT_ROUNDS = 10;

async function run() {
  let created = 0;
  let skipped = 0;

  for (const u of SEED_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      console.log(`[seed:users] Skipped (already exists): ${u.email}`);
      skipped++;
      continue;
    }

    const hashedPassword = await bcrypt.hash(u.password, SALT_ROUNDS);
    await User.create({ ...u, password: hashedPassword, status: "active" });
    console.log(`[seed:users] Created ${u.role}: ${u.email}`);
    created++;
  }

  console.log(`[seed:users] Done — ${created} created, ${skipped} skipped`);
}

// Allow running standalone: node scripts/seedUsers.js
if (require.main === module) {
  connectDB(process.env.MONGO_URL)
    .then(run)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed:users] Failed:", err);
      process.exit(1);
    });
}

module.exports = { run };
