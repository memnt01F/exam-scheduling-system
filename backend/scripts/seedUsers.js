require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/user.model");

const SEED_USERS = [{
    name: "Admin",
    email: "admin@kfupm.edu.sa",
    role: "admin",
    department: "",
    createdBy: "seed",
}, ];

const FIXED_PASSWORD = "ExamSchedulingCCM";
const SALT_ROUNDS = 10;

async function run() {
    let created = 0;
    let skipped = 0;

    const hashedPassword = await bcrypt.hash(FIXED_PASSWORD, SALT_ROUNDS);

    for (const u of SEED_USERS) {
        const existing = await User.findOne({ email: u.email });
        if (existing) {
            console.log(`[seed:users] Skipped (already exists): ${u.email}`);
            skipped++;
            continue;
        }

        await User.create({
            ...u,
            password: hashedPassword,
            status: "active",
            managedDepartments: [],
            mustChangePassword: true,
        });
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