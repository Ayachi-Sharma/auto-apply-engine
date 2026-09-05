import { chromium } from "playwright";
import { LeverAdapter } from "./adapters/leverAdapter.js";
import { mapFieldToProfile } from "./services/fieldMapper.js";

const jobUrl =
  "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164";

const resumePath = "E:/Projects/auto-apply-engine/backend/test-resume.pdf";

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

const browser = await chromium.launch({
  headless: false,
});

const page = await browser.newPage();

const adapter = new LeverAdapter(page);

try {
  // 1. Open Lever application
  await adapter.openApplication(jobUrl);

  // 2. Read fields
  const fields = await adapter.getFields();

  console.log(`Found ${fields.length} fields`);

  // 3. Upload resume
await adapter.uploadResume(resumePath);

  // 4. Map and fill known profile fields
  for (const field of fields) {
    const mapping = mapFieldToProfile(field, profile);

    if (mapping.value === null || mapping.value === undefined) {
      continue;
    }

    // Only test normal profile fields for now
    const supportedFields = [
      "name",
      "email",
      "phone",
      "location",
      "org",
      "urls[LinkedIn]",
      "urls[Github]",
    ];

    if (!supportedFields.includes(field.name)) {
      continue;
    }

    await adapter.fillField(field, mapping.value);
  }

// 5. Take screenshot
await page.screenshot({
  path: "screenshots/lever-filled-form.png",
  fullPage: true,
});

  console.log("✅ Known fields filled successfully");
  console.log("📸 Screenshot saved to screenshots/lever-filled-form.png");

  // Keep browser open so we can inspect it
  await page.waitForTimeout(5000);
} catch (error) {
  console.error("❌ Fill test failed:", error);
} finally {
  await browser.close();
}