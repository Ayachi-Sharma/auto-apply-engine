import "dotenv/config";
import mongoose from "mongoose";

import { connectDatabase } from "./config/database.js";
import { apply_resume } from "./services/applicationEngine.js";

const runId = "952e9b26-8ea0-43dc-b30b-05287436f529";

const answers = {
  pronouns: "Use name only",

  "eeo[gender]": "Decline to self-identify",

  "eeo[race]": "Decline to self-identify",

  "eeo[veteran]": "Decline to self-identify",

  "eeo[disability]": "I do not want to answer ",

  "eeo[disabilitySignature]": "Ayachi Sharma",

  "eeo[disabilitySignatureDate]": "09/05/2026",

  "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field0]":
    "21-29",

  "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field1]":
    "Female",

  "surveysResponses[8dfb36ea-fd79-4bea-aa2d-734a7b290c35][responses][field2]":
    ["Asian"],
};

await connectDatabase();

const result = await apply_resume(runId, answers);

console.log("\n========== RESUME RESULT ==========\n");
console.log(JSON.stringify(result, null, 2));

await mongoose.disconnect();

console.log("\n✅ Database disconnected");