require("dotenv").config();
const mongoose = require("mongoose");
const Booking = require("../models/booking.model");

function normalizeCode(s) {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function main() {
  const uri = process.env.MONGO_URL;
  if (!uri) {
    throw new Error("Missing MONGO_URL in environment");
  }

  await mongoose.connect(uri);

  const all = await Booking.find().sort({ updatedAt: -1, createdAt: -1 }).lean();
  const keepByCode = new Map(); // code -> bookingId
  const deleteIds = [];

  for (const b of all) {
    const code = normalizeCode(b.courseCode);
    if (!code) continue;
    if (!keepByCode.has(code)) {
      keepByCode.set(code, b._id.toString());
    } else {
      deleteIds.push(b._id);
    }
  }

  if (deleteIds.length === 0) {
    console.log("No duplicates found.");
    await mongoose.disconnect();
    return;
  }

  const result = await Booking.deleteMany({ _id: { $in: deleteIds } });
  console.log(`Deleted ${result.deletedCount} duplicate booking(s).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

