import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase } from "./config/database.js";
import { ApplicationRun } from "./models/applicationRun.js";

const runId = "6b1e04ce-4f02-4554-98ed-1efce294b839";

await connectDatabase();

const run = await ApplicationRun.findOne({ runId }).lean();

if (!run) {
  console.log("❌ Run not found");
} else {
  console.log("\n========== TRACE ==========\n");

  console.log(`Run ID: ${run.runId}`);
  console.log(`Status: ${run.status}`);
  console.log(`Trace entries: ${run.trace.length}\n`);

  console.log(JSON.stringify(run.trace, null, 2));
}

await mongoose.disconnect();

console.log("\n✅ Database disconnected");