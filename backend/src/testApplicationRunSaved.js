import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase } from "./config/database.js";
import { ApplicationRun } from "./models/applicationRun.js";

await connectDatabase();

const run = await ApplicationRun.findOne({
  runId: "8c7df613-cbb6-4382-b110-df4983e60778",
});

if (!run) {
  throw new Error("Application run was not found in MongoDB");
}

console.log("\n========== SAVED APPLICATION RUN ==========\n");

console.log("runId:", run.runId);
console.log("status:", run.status);
console.log("ATS:", run.ats);
console.log("jobUrl:", run.jobUrl);
console.log("fields:", run.fields.length);
console.log("missingFields:", run.missingFields.length);

console.log("\n✅ Application run successfully persisted");

await mongoose.disconnect();

console.log("✅ Database disconnected");