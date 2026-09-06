import { chromium } from "playwright";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { detectATS } from "./atsDetector.js";
import {
  mapFieldToProfile,
  getMissingFields,
} from "./fieldMapper.js";

import { LeverAdapter } from "../adapters/leverAdapter.js";
import { ApplicationRun } from "../models/applicationRun.js";

function createAdapter(ats, page) {
  switch (ats) {
    case "lever":
      return new LeverAdapter(page);

    default:
      throw new Error(`Adapter not implemented yet: ${ats}`);
  }
}

async function recordTrace(run, page, runId, data) {
  const screenshotDir = path.resolve(
    process.cwd(),
    "screenshots",
    runId
  );

  fs.mkdirSync(screenshotDir, {
    recursive: true,
  });

  const safeFieldName = data.field
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

  const screenshotName = `${Date.now()}-${safeFieldName}.png`;

  const screenshotPath = path.join(
    screenshotDir,
    screenshotName
  );

  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
  });

  const traceEntry = {
    ...data,
    screenshot: screenshotPath,
    timestamp: new Date().toISOString(),
  };

  run.trace.push(traceEntry);

  await run.save();
}

export async function apply(jobUrl, profile, resumePath) {
  let browser;
  let context;
  let run;
  let tracingStarted = false;
  let tracePath;

  try {
    const ats = detectATS(jobUrl);
    const runId = randomUUID();

    tracePath = path.resolve(
      process.cwd(),
      "recordings",
      `${runId}.zip`
    );

    fs.mkdirSync(path.dirname(tracePath), {
      recursive: true,
    });

    run = await ApplicationRun.create({
      runId,
      jobUrl,
      ats,
      profile,
      status: "RUNNING",
      answers: {},
      resumePath,
      trace: [],
      recordingPath: tracePath,
    });

    console.log(`Starting application run: ${runId}`);
    console.log(`ATS detected: ${ats}`);

    browser = await chromium.launch({
      headless: false,
    });

    context = await browser.newContext();

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });

    tracingStarted = true;

    const page = await context.newPage();

    const adapter = createAdapter(ats, page);

    await adapter.openApplication(jobUrl);

    const fields = await adapter.getFields();

    console.log(`Found ${fields.length} fields`);

    run.fields = fields;
    await run.save();

    // Fill fields that can be confidently mapped from the profile.
    for (const field of fields) {
      if (field.name === "resume") {
        continue;
      }

      const mapping = mapFieldToProfile(field, profile);

      if (
        mapping.value !== null &&
        mapping.value !== undefined
      ) {
        console.log(
          `Filling ${field.name} → ${mapping.value}`
        );

        await adapter.fillField(field, mapping.value);

        await recordTrace(run, page, runId, {
          action: "fill",
          field: field.name,
          value: mapping.value,
          source: mapping.source,
        });
      }
    }

    // Upload resume.
    if (resumePath) {
      await adapter.uploadResume(resumePath);

      await recordTrace(run, page, runId, {
        action: "upload_resume",
        field: "resume",
        value: resumePath,
        source: "resumePath",
      });
    }

    // Find fields that require user input.
    const missingFields = getMissingFields(fields, profile);

    run.missingFields = missingFields;

    if (missingFields.length > 0) {
      run.status = "NEEDS_INPUT";
      await run.save();

      console.log(
        `Application needs ${missingFields.length} user answers`
      );

      return {
        status: "NEEDS_INPUT",
        runId,
        questions: missingFields,
      };
    }

    // Submission is intentionally not implemented yet.
    run.status = "FAILED";
    run.failure = {
      reason: "Submission flow not implemented yet",
      step: "submit",
    };

    await run.save();

    return {
      status: "FAILED",
      runId,
      reason: "Submission flow not implemented yet",
      step: "submit",
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
    if (context && tracingStarted) {
      try {
        await context.tracing.stop({
          path: tracePath,
        });

        console.log(
          `✅ Playwright trace saved: ${tracePath}`
        );
      } catch (error) {
        console.error(
          "❌ Failed to save Playwright trace:",
          error.message
        );
      }
    }

    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}

export async function apply_resume(runId, answers) {
  let browser;
  let context;
  let run;
  let tracingStarted = false;
  let tracePath;

  try {
    run = await ApplicationRun.findOne({ runId });

    if (!run) {
      return {
        status: "FAILED",
        reason: `Application run not found: ${runId}`,
        step: "resume",
      };
    }

    if (run.status !== "NEEDS_INPUT") {
      return {
        status: "FAILED",
        reason: `Application run cannot be resumed from status: ${run.status}`,
        step: "resume",
      };
    }

    const missingAnswers = run.missingFields.filter(
      (question) =>
        answers[question.field] === undefined ||
        answers[question.field] === null
    );

    if (missingAnswers.length > 0) {
      return {
        status: "NEEDS_INPUT",
        runId,
        questions: missingAnswers,
      };
    }

    tracePath = path.resolve(
      process.cwd(),
      "recordings",
      `${runId}-resume-${Date.now()}.zip`
    );

    fs.mkdirSync(path.dirname(tracePath), {
      recursive: true,
    });

    browser = await chromium.launch({
      headless: false,
    });

    context = await browser.newContext();

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });

    tracingStarted = true;

    const page = await context.newPage();

    const adapter = createAdapter(run.ats, page);

    await adapter.openApplication(run.jobUrl);

    const fields = await adapter.getFields();

    console.log(`Found ${fields.length} fields on resume`);

    // Refill profile fields.
    for (const field of fields) {
      if (field.name === "resume") {
        continue;
      }

      const mapping = mapFieldToProfile(field, run.profile);

      if (
        mapping.value !== null &&
        mapping.value !== undefined
      ) {
        console.log(
          `Filling ${field.name} → ${mapping.value}`
        );

        await adapter.fillField(field, mapping.value);

        await recordTrace(run, page, runId, {
          action: "fill",
          field: field.name,
          value: mapping.value,
          source: mapping.source,
        });

        console.log(
          `✅ Refilled ${field.name} from ${mapping.source}`
        );
      }
    }

    // Re-upload resume.
    if (run.resumePath) {
      await adapter.uploadResume(run.resumePath);

      await recordTrace(run, page, runId, {
        action: "upload_resume",
        field: "resume",
        value: run.resumePath,
        source: "resumePath",
      });
    }

    // Fill all user-provided answers.
    for (const question of run.missingFields) {
      const answer = answers[question.field];

      const field = fields.find(
        (item) => item.name === question.field
      );

      if (!field) {
        throw new Error(
          `Field not found during resume: ${question.field}`
        );
      }

      console.log(
        `Filling ${question.field} → ${answer}`
      );

      await adapter.fillField(field, answer);

      await recordTrace(run, page, runId, {
        action: "fill",
        field: question.field,
        value: answer,
        source: "user_answer",
      });

      console.log(
        `✅ Filled ${question.field} from user answer`
      );
    }

    // Store the latest resume recording.
    run.recordingPath = tracePath;

    run.answers = answers;
    run.status = "RUNNING";

    await run.save();

    return {
      status: "READY_FOR_SUBMISSION",
      runId,
    };
  } catch (error) {
    console.error("Resume failed:", error);

    if (run) {
      run.status = "FAILED";
      run.failure = {
        reason: error.message,
        step: "resume",
      };

      await run.save();
    }

    return {
      status: "FAILED",
      reason: error.message,
      step: "resume",
    };
  } finally {
    if (context && tracingStarted) {
      try {
        await context.tracing.stop({
          path: tracePath,
        });

        console.log(
          `✅ Playwright trace saved: ${tracePath}`
        );
      } catch (error) {
        console.error(
          "❌ Failed to save Playwright trace:",
          error.message
        );
      }
    }

    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}


// import { chromium } from "playwright";
// import { randomUUID } from "crypto";

// import { detectATS } from "./atsDetector.js";
// import { mapFieldToProfile, getMissingFields } from "./fieldMapper.js";
// import { LeverAdapter } from "../adapters/leverAdapter.js";
// import { ApplicationRun } from "../models/applicationRun.js";

// export async function apply(jobUrl, profile, resumePath) {
//   let browser;
//   let run;

//   try {
//     // 1. Detect ATS
//     const ats = detectATS(jobUrl);

//     console.log(`Detected ATS: ${ats}`);

//     // 2. Create persistent application run
//     const runId = randomUUID();

//     run = await ApplicationRun.create({
//       runId,
//       jobUrl,
//       ats,
//       profile,
//       status: "RUNNING",
//       answers: {},
//       resumePath: resumePath || null,
//     });

//     console.log(`Created application run: ${runId}`);

//     // 3. Start browser
//     browser = await chromium.launch({
//       headless: false,
//     });

//     const page = await browser.newPage();

//     // 4. Create ATS adapter
//     const adapter = createAdapter(ats, page);

//     // 5. Open application
//     await adapter.openApplication(jobUrl);

//     // 6. Read application fields
//     const fields = await adapter.getFields();

//     console.log(`Found ${fields.length} fields`);

//     // Save discovered fields
//     run.fields = fields;
//     await run.save();

//     // 7. Fill fields that can be confidently mapped
//     for (const field of fields) {
//       if (field.name === "resume") {
//         continue;
//       }

//       const mapping = mapFieldToProfile(field, profile);

//       if (
//         mapping.value !== null &&
//         mapping.value !== undefined
//       ) {
//         await adapter.fillField(field, mapping.value);

//         console.log(
//           `✅ Filled ${field.name} from ${mapping.source}`
//         );
//       }
//     }

//     // 8. Upload resume
//     if (resumePath) {
//       await adapter.uploadResume(resumePath);
//     }

//     // 9. Find fields that still need user input
//     const missingFields = getMissingFields(fields, profile);

//     if (missingFields.length > 0) {
//       console.log(
//         `⚠️ ${missingFields.length} fields require user input`
//       );

//       run.status = "NEEDS_INPUT";
//       run.missingFields = missingFields;

//       await run.save();

//       return {
//         status: "NEEDS_INPUT",
//         runId,
//         questions: missingFields,
//       };
//     }

//     // Submission will be implemented next.
//     run.status = "FAILED";
//     run.failure = {
//       reason: "Submission flow not implemented yet",
//       step: "submission",
//     };

//     await run.save();

//     return {
//       status: "FAILED",
//       reason: "Submission flow not implemented yet",
//       step: "submission",
//     };
//   } catch (error) {
//     console.error("Application failed:", error);

//     if (run) {
//       run.status = "FAILED";
//       run.failure = {
//         reason: error.message,
//         step: "application",
//       };

//       await run.save();
//     }

//     return {
//       status: "FAILED",
//       reason: error.message,
//       step: "application",
//     };
//   } finally {
//     if (browser) {
//       await browser.close();
//       console.log("Browser closed");
//     }
//   }
// }

// export async function apply_resume(runId, answers) {
//   let browser;

//   try {
//     // 1. Load the saved application run
//     const run = await ApplicationRun.findOne({ runId });

//     if (!run) {
//       return {
//         status: "FAILED",
//         reason: `Application run not found: ${runId}`,
//         step: "resume",
//       };
//     }

//     if (run.status !== "NEEDS_INPUT") {
//       return {
//         status: "FAILED",
//         reason: `Application run cannot be resumed from status: ${run.status}`,
//         step: "resume",
//       };
//     }

//     // 2. Validate that all required answers were provided
//     const missingAnswers = run.missingFields.filter(
//       (question) =>
//         answers[question.field] === undefined ||
//         answers[question.field] === null
//     );

//     if (missingAnswers.length > 0) {
//       return {
//         status: "NEEDS_INPUT",
//         runId,
//         questions: missingAnswers,
//       };
//     }

//     // 3. Start a new browser session
//     browser = await chromium.launch({
//       headless: false,
//     });

//     const page = await browser.newPage();

//     // 4. Recreate the ATS adapter
//     const adapter = createAdapter(run.ats, page);

//     // 5. Reopen the application
//     await adapter.openApplication(run.jobUrl);

//     // 6. Read the fields again
//     const fields = await adapter.getFields();

//     console.log(`Found ${fields.length} fields on resume`);

//     // 7. Refill fields from the saved profile
//     for (const field of fields) {
//       if (field.name === "resume") {
//         continue;
//       }

//       const mapping = mapFieldToProfile(field, run.profile);

//       if (
//         mapping.value !== null &&
//         mapping.value !== undefined
//       ) {
//         await adapter.fillField(field, mapping.value);

//         console.log(
//           `✅ Refilled ${field.name} from ${mapping.source}`
//         );
//       }
//     }

//     // 8. Upload resume again
//     if (run.resumePath) {
//       await adapter.uploadResume(run.resumePath);
//     }

//     // 9. Fill the user's answers
//     for (const question of run.missingFields) {
//       const answer = answers[question.field];

//       const field = fields.find(
//         (item) => item.name === question.field
//       );

//       if (!field) {
//         throw new Error(
//           `Field not found during resume: ${question.field}`
//         );
//       }

//       await adapter.fillField(field, answer);

//       console.log(
//         `✅ Filled ${question.field} from user answer`
//       );
//     }

//     // 10. Save answers
//     run.answers = answers;

//     // For now we stop before submission.
//     run.status = "RUNNING";

//     await run.save();

//     return {
//       status: "READY_FOR_SUBMISSION",
//       runId,
//     };
//   } catch (error) {
//     console.error("Resume failed:", error);

//     return {
//       status: "FAILED",
//       reason: error.message,
//       step: "resume",
//     };
//   } finally {
//     if (browser) {
//       await browser.close();
//       console.log("Browser closed");
//     }
//   }
// }

// function createAdapter(ats, page) {
//   switch (ats) {
//     case "lever":
//       return new LeverAdapter(page);

//     default:
//       throw new Error(`No adapter implemented for ATS: ${ats}`);
//   }
// }