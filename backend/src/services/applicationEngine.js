import { chromium } from "playwright";
import { randomUUID } from "crypto";

import { detectATS } from "./atsDetector.js";
import { mapFieldToProfile, getMissingFields } from "./fieldMapper.js";
import { LeverAdapter } from "../adapters/leverAdapter.js";
import { ApplicationRun } from "../models/applicationRun.js";

export async function apply(jobUrl, profile, resumePath) {
  let browser;
  let run;

  try {
    // 1. Detect ATS
    const ats = detectATS(jobUrl);

    console.log(`Detected ATS: ${ats}`);

    // 2. Create persistent application run
    const runId = randomUUID();

    run = await ApplicationRun.create({
      runId,
      jobUrl,
      ats,
      status: "RUNNING",
      answers: {},
      resumePath: resumePath || null,
    });

    console.log(`Created application run: ${runId}`);

    // 3. Start browser
    browser = await chromium.launch({
      headless: false,
    });

    const page = await browser.newPage();

    // 4. Create ATS adapter
    const adapter = createAdapter(ats, page);

    // 5. Open application
    await adapter.openApplication(jobUrl);

    // 6. Read application fields
    const fields = await adapter.getFields();

    console.log(`Found ${fields.length} fields`);

    // Save discovered fields
    run.fields = fields;
    await run.save();

    // 7. Fill fields that can be confidently mapped
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

    // 8. Upload resume
    if (resumePath) {
      await adapter.uploadResume(resumePath);
    }

    // 9. Find fields that still need user input
    const missingFields = getMissingFields(fields, profile);

    if (missingFields.length > 0) {
      console.log(
        `⚠️ ${missingFields.length} fields require user input`
      );

      run.status = "NEEDS_INPUT";
      run.missingFields = missingFields;

      await run.save();

      return {
        status: "NEEDS_INPUT",
        runId,
        questions: missingFields,
      };
    }

    // Submission will be implemented next.
    run.status = "FAILED";
    run.failure = {
      reason: "Submission flow not implemented yet",
      step: "submission",
    };

    await run.save();

    return {
      status: "FAILED",
      reason: "Submission flow not implemented yet",
      step: "submission",
    };
  } catch (error) {
    console.error("Application failed:", error);

    if (run) {
      run.status = "FAILED";
      run.failure = {
        reason: error.message,
        step: "application",
      };

      await run.save();
    }

    return {
      status: "FAILED",
      reason: error.message,
      step: "application",
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}

function createAdapter(ats, page) {
  switch (ats) {
    case "lever":
      return new LeverAdapter(page);

    default:
      throw new Error(`No adapter implemented for ATS: ${ats}`);
  }
}