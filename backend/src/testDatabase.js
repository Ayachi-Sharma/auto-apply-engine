import "dotenv/config";
import { connectDatabase } from "./config/database.js";
import mongoose from "mongoose";

await connectDatabase();

console.log("✅ Database test passed");

await mongoose.disconnect();

console.log("✅ MongoDB disconnected");