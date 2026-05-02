require("dotenv").config();
const mongoose = require("mongoose");
const Booking = require("../models/booking.model");

async function main() {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("Missing MONGO_URL in environment");

  await mongoose.connect(uri);
  console.log("Connected.");

  // 1. Drop old unique index on courseCode alone (if it exists).
  try {
    await Booking.collection.dropIndex("courseCode_1");
    console.log("Dropped old index: courseCode_1");
  } catch (err) {
    if (err?.codeName === "IndexNotFound" || err?.message?.includes("index not found")) {
      console.log("Index courseCode_1 not found — skipping drop.");
    } else {
      console.log("Index drop skipped:", err.message);
    }
  }

  // 2. Add status: "pending" to any existing bookings that don't have it.
  const result = await mongoose.connection.collection("bookings").updateMany(
    { status: { $exists: false } },
    { $set: { status: "pending" } }
  );
  console.log(`Added status: "pending" to ${result.modifiedCount} existing booking(s).`);

  // 3. Sync the new compound unique index { courseCode, examType }.
  await Booking.syncIndexes();
  console.log("Indexes synced:");
  const indexes = await Booking.collection.indexes();
  indexes.forEach(idx => console.log(" ", JSON.stringify(idx.key), idx.unique ? "(unique)" : ""));

  await mongoose.disconnect();
  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
