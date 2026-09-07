import "dotenv/config";
import { chromium } from "playwright";

import { LeverAdapter } from "./adapters/leverAdapter.js";

const jobUrl =
  "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164/apply";

const browser = await chromium.launch({
  headless: false,
});

try {
  const page = await browser.newPage();

  const adapter = new LeverAdapter(page);

  await adapter.openApplication(jobUrl);

  const fields = await adapter.getFields();

  console.log(`Found ${fields.length} fields`);

  console.log(
    "\n⚠️ This test does NOT fill or submit the application."
  );

  console.log(
    "It only verifies that the submit method can locate the button."
  );

  const submitButton = page.locator(
    'button[type="submit"]'
  );

  const exists = await submitButton.count();

  console.log(`Submit buttons found: ${exists}`);

  if (exists === 0) {
    console.log("❌ Submit button not found");
  } else {
    console.log("✅ Submit button located");
  }
} finally {
  await browser.close();
  console.log("Browser closed");
}
