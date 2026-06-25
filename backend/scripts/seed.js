require("dotenv").config();
const connectDB = require("../config/db");
const { run: seedEnrollments } = require("./seedEnrollments");
const { run: seedUsers } = require("./seedUsers");

async function main() {
  await connectDB(process.env.MONGO_URL);

  console.log("\n── Seeding enrollments ──────────────────────────────────");
  await seedEnrollments();

  console.log("\n── Seeding users ────────────────────────────────────────");
  await seedUsers();

  console.log("\n── All done ─────────────────────────────────────────────\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
