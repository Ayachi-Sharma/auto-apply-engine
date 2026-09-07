import "dotenv/config";
import { connectDatabase } from "./config/database.js";
import mongoose from "mongoose";

import { apply } from "./services/applicationEngine.js";

const jobUrl =
  "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164";

const profile = {
  personalInfo: {
    fullName: "Archi Sharma",
    email: "archi@example.com",
    phone: "+91-9832432106",
    address: "Raipur, Rajasthan",
    profiles: [
      {
        platform: "LinkedIn",
        url: "https://linkedin.com/in/archi",
      },
      {
        platform: "Github",
        url: "https://github.com/archi",
      },
    ],
  },

  experience: [
    {
      company: "Self Employed",
      title: "Remote",
      current: true,
    },
  ],
};

await connectDatabase();

const result = await apply(
  jobUrl,
  profile,
  "E:/Projects/auto-apply-engine/backend/test-resume.pdf"
);

console.log("\n========== APPLY RESULT ==========\n");
console.log(JSON.stringify(result, null, 2));

await mongoose.disconnect();
console.log("\n✅ Database disconnected");