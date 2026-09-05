import "dotenv/config";
import { connectDatabase } from "./config/database.js";
import mongoose from "mongoose";

import { apply } from "./services/applicationEngine.js";

const jobUrl =
  "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164";

const profile = {
  personalInfo: {
    fullName: "Ayachi Sharma",
    email: "ayachi@example.com",
    phone: "+91-9876543210",
    address: "Jaipur, Rajasthan",
    profiles: [
      {
        platform: "LinkedIn",
        url: "https://linkedin.com/in/ayachi",
      },
      {
        platform: "Github",
        url: "https://github.com/ayachi",
      },
    ],
  },

  experience: [
    {
      company: "Tech Company",
      title: "Software Developer",
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