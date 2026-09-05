import { chromium } from "playwright";
import { detectATS } from "./atsDetector.js";
import { mapFieldToProfile, getMissingFields } from "./fieldMapper.js";
import { LeverAdapter } from "../adapters/leverAdapter.js";

export async function apply(jobUrl, profile, resumePath) {
  let browser;

  try {
    // 1. Detect ATS
    const ats = detectATS(jobUrl);

    console.log(`Detected ATS: ${ats}`);

    // 2. Start browser
    browser = await chromium.launch({
      headless: false,
    });

    const page = await browser.newPage();

    // 3. Create ATS adapter
    const adapter = createAdapter(ats, page);

    // 4. Open application
    await adapter.openApplication(jobUrl);

    // 5. Read application fields
    const fields = await adapter.getFields();

    console.log(`Found ${fields.length} fields`);

    // 6. Fill fields that can be confidently mapped
    for (const field of fields) {
      if (field.name === "resume") {
        continue;
      }

      const mapping = mapFieldToProfile(field, profile);

      if (
        mapping.value !== null &&
        mapping.value !== undefined
      ) {
        await adapter.fillField(field, mapping.value);

        console.log(
          `✅ Filled ${field.name} from ${mapping.source}`
        );
      }
    }

    // 7. Upload resume
    if (resumePath) {
      await adapter.uploadResume(resumePath);
    }

    // 8. Find fields that still need user input
    const missingFields = getMissingFields(fields, profile);

    if (missingFields.length > 0) {
      console.log(
        `⚠️ ${missingFields.length} fields require user input`
      );

      return {
        status: "NEEDS_INPUT",
        questions: missingFields,
      };
    }

    // Submission will be implemented next.
    return {
      status: "READY",
    };
  } catch (error) {
    console.error("Application failed:", error);

    return {
      status: "FAILED",
      reason: error.message,
      step: "application",
    };
  }

  // Don't close the browser yet.
  // We need the page to remain open for the pause/resume flow.
}

function createAdapter(ats, page) {
  switch (ats) {
    case "lever":
      return new LeverAdapter(page);

    default:
      throw new Error(`No adapter implemented for ATS: ${ats}`);
  }
}