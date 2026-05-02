const mongoose = require("mongoose");

async function connectDB(url) {
  try {
    await mongoose.connect(url);
    console.log("[DB] Mongo connected");
  } catch (err) {
    console.error("Connection error:", err.message);
    throw err;
  }
}

module.exports = connectDB;
