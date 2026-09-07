import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase } from "./config/database.js";
import { apply_resume } from "./services/applicationEngine.js";
// import { connectDB, disconnectDB } from "./config/database.js";

async function run() {
  // await connectDatabase();

  // Paste the latest runId from testApplicationEngine.js here
  const runId = "9b479a62-37e5-42dd-a007-a3da02c6fc23";

  // Formats today's date as MM/DD/YYYY
  const today = new Date();
  const todayFormatted = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(
    today.getDate()
  ).padStart(2, "0")}/${today.getFullYear()}`;

  const answers = {
    pronouns: ["Use name only"],
    "eeo[gender]": "Decline to self-identify",
    "eeo[race]": "Decline to self-identify",
    "eeo[veteran]": "Decline to self-identify",
    "eeo[disability]": "I do not want to answer ",
    "eeo[disabilitySignature]": "Archi Sharma",
    "eeo[disabilitySignatureDate]": todayFormatted, // Dynamically today's date
    "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field0]": "21-29",
    "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field1]": "Male",
    "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field2]": ["White / Caucasian"],
  };

  await connectDatabase();
  const result = await apply_resume(runId, answers);

  console.log("\n========== RESUME RESULT ==========\n");
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();

}

run();

// import "dotenv/config";
// import mongoose from "mongoose";

// import { connectDatabase } from "./config/database.js";
// import { apply_resume } from "./services/applicationEngine.js";

// const runId = "b446f9f1-fc96-4cb8-b096-33df466dc162";

// // Helper to get today's date in MM/DD/YYYY format
// const today = new Date();
// const todayFormatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;

// const answers = {
//   "pronouns": ["Use name only"],
//   "eeo[gender]": "Decline to self-identify",
//   "eeo[race]": "Decline to self-identify",
//   "eeo[veteran]": "Decline to self-identify",
//   "eeo[disability]": "I do not want to answer ",
//   "eeo[disabilitySignature]": "Ayachi Sharma",
//   "eeo[disabilitySignatureDate]": todayFormatted, // Must be today's date, NOT 2026
//   "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field0]": "21-29",
//   "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field1]": "Female",
//   "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field2]": ["Asian"]
// };

// await connectDatabase();

// const result = await apply_resume(runId, answers);

// console.log("\n========== RESUME RESULT ==========\n");
// console.log(JSON.stringify(result, null, 2));

// await mongoose.disconnect();

// console.log("\n✅ Database disconnected");