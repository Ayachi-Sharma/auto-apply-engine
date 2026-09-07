import { chromium } from "playwright";
import { LeverAdapter } from "./adapters/leverAdapter.js";
import { getMissingFields } from "./services/fieldMapper.js";

const jobUrl =
  "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164";

const profile = {
  personalInfo: {
    fullName: "Archi Sharma",
    email: "archi@example.com",
    phone: "+91-9876543210",
    address: "Jaipur, Rajasthan",
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
      company: "Tech Company",
      title: "Software Developer",
      current: true,
    },
  ],
};

const browser = await chromium.launch({
  headless: false,
});

const page = await browser.newPage();

const adapter = new LeverAdapter(page);

try {
  // 1. Open Lever application
  await adapter.openApplication(jobUrl);

  // 2. Get the REAL fields from Lever
  const fields = await adapter.getFields();

  console.log(`Found ${fields.length} Lever fields`);

  console.log("\n========== ALL FIELDS ==========\n");

for (const field of fields) {
  console.log({
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    options: field.options,
  });
}

  // 3. Find fields that need user input
  const missingFields = getMissingFields(fields, profile);

  console.log("\n========== NEEDS INPUT ==========\n");

  console.log(JSON.stringify(missingFields, null, 2));

  console.log(
    `\nTotal fields requiring input: ${missingFields.length}`
  );

  await page.waitForTimeout(3000);
} catch (error) {
  console.error("❌ Test failed:", error);
} finally {
  await browser.close();
}