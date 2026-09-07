import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { detectATS } from "./atsDetector.js";
import { mapFieldToProfile, getMissingFields } from "./fieldMapper.js";

import { LeverAdapter } from "../adapters/leverAdapter.js";
import { GreenhouseAdapter } from "../adapters/greenhouseAdapter.js";
import { AshbyAdapter } from "../adapters/ashbyAdapter.js";
import { WorkableAdapter } from "../adapters/workableAdapter.js";
import { ApplicationRun } from "../models/applicationRun.js";
import * as notifier from "./notifier.js";

// ─── Stealth ─────────────────────────────────────────────────────────────────
chromium.use(stealthPlugin());

// ─── Named steps (used in failure reporting) ─────────────────────────────────
export const STEPS = {
  OPEN_APPLICATION: "open_application",
  EXTRACT_FIELDS:   "extract_fields",
  FILL_FIELDS:      "fill_fields",
  UPLOAD_RESUME:    "upload_resume",
  WAIT_FOR_INPUT:   "wait_for_input",
  FILL_ANSWERS:     "fill_answers",
  SUBMIT:           "submit",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createAdapter(ats, page) {
  switch (ats) {
    case "lever":      return new LeverAdapter(page);
    case "greenhouse": return new GreenhouseAdapter(page);
    case "ashby":      return new AshbyAdapter(page);
    case "workable":   return new WorkableAdapter(page);
    default:           throw new Error(`Adapter not implemented: ${ats}`);
  }
}

async function createBrowserContext() {
  const browser = await chromium.launch({
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-infobars",
      "--window-size=1280,900",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
  });

  return { browser, context };
}

async function recordTrace(run, page, runId, data) {
  const screenshotDir = path.resolve(process.cwd(), "screenshots", runId);
  fs.mkdirSync(screenshotDir, { recursive: true });

  const safeFieldName = data.field
    ? data.field.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)
    : "action";

  const screenshotName = `${Date.now()}-${safeFieldName}.png`;
  const screenshotPath = path.join(screenshotDir, screenshotName);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {
    console.warn(`Screenshot skipped for ${safeFieldName}: page is navigating.`);
  }

  run.trace.push({ ...data, screenshot: screenshotPath, timestamp: new Date().toISOString() });
  await run.save();
}

// ─── Core engine functions ────────────────────────────────────────────────────

/**
 * Run the browser session for an existing ApplicationRun (status=RUNNING).
 * Called by the API route after creating the record, or by apply() below.
 */
export async function applyRun(runId) {
  let browser, context, run;
  let currentStep = STEPS.OPEN_APPLICATION;

  try {
    run = await ApplicationRun.findOne({ runId });
    if (!run) throw new Error(`Application run not found: ${runId}`);

    const { jobUrl, profile, resumePath, ats } = run;

    notifier.emit(runId, {
      type: "PROGRESS",
      step: STEPS.OPEN_APPLICATION,
      message: `Opening ${ats} application...`,
    });

    ({ browser, context } = await createBrowserContext());
    const page = await context.newPage();
    const adapter = createAdapter(ats, page);

    await adapter.openApplication(jobUrl);
    notifier.emit(runId, {
      type: "PROGRESS",
      step: STEPS.OPEN_APPLICATION,
      message: "Application opened",
    });

    // ── Extract fields ──────────────────────────────────────────────────────
    currentStep = STEPS.EXTRACT_FIELDS;
    const fields = await adapter.getFields();
    notifier.emit(runId, {
      type: "PROGRESS",
      step: STEPS.EXTRACT_FIELDS,
      message: `Found ${fields.length} fields`,
    });

    run.fields = fields;
    await run.save();

    // ── Fill profile fields ─────────────────────────────────────────────────
    currentStep = STEPS.FILL_FIELDS;
    for (const field of fields) {
      if (field.name === "resume") continue;
      const mapping = mapFieldToProfile(field, profile);
      if (mapping.value !== null && mapping.value !== undefined) {
        console.log(`Filling ${field.name} → ${mapping.value}`);
        await adapter.fillField(field, mapping.value);
        notifier.emit(runId, {
          type: "PROGRESS",
          step: STEPS.FILL_FIELDS,
          message: `Filled ${field.name}`,
        });
        await recordTrace(run, page, runId, {
          action: "fill",
          field: field.name,
          value: mapping.value,
          source: mapping.source,
        });
      }
    }

    // ── Upload resume ───────────────────────────────────────────────────────
    currentStep = STEPS.UPLOAD_RESUME;
    if (resumePath) {
      await adapter.uploadResume(resumePath);
      notifier.emit(runId, {
        type: "PROGRESS",
        step: STEPS.UPLOAD_RESUME,
        message: "Resume uploaded",
      });
      await recordTrace(run, page, runId, {
        action: "upload_resume",
        field: "resume",
        value: resumePath,
        source: "resumePath",
      });
    }

    // ── Check for missing fields ────────────────────────────────────────────
    currentStep = STEPS.WAIT_FOR_INPUT;
    const missingFields = getMissingFields(fields, profile);
    run.missingFields = missingFields;

    if (missingFields.length > 0) {
      run.status = "NEEDS_INPUT";
      await run.save();

      console.log(`Application needs ${missingFields.length} user answers`);
      notifier.emit(runId, {
        type: "NEEDS_INPUT",
        runId,
        questions: missingFields,
      });

      return { status: "NEEDS_INPUT", runId, questions: missingFields };
    }

    // ── Submit directly (no missing fields) ────────────────────────────────
    currentStep = STEPS.SUBMIT;
    console.log("Submitting application...");
    const submissionResult = await adapter.submit();

    await recordTrace(run, page, runId, {
      action: "submit",
      field: "application",
      value: "submitted",
      source: `${ats}Adapter.submit`,
    });

    console.log("Application submitted");

    run.status = "SUBMITTED";
    run.receipt = submissionResult.receipt;
    run.confirmationText = submissionResult.confirmationText;
    await run.save();

    notifier.emit(runId, {
      type: "SUBMITTED",
      runId,
      receipt: submissionResult.receipt,
    });

    return {
      status: "SUBMITTED",
      runId,
      receipt: submissionResult.receipt,
      confirmation_text: submissionResult.confirmationText,
    };
  } catch (error) {
    console.error("Application failed:", error);
    if (run) {
      run.status = "FAILED";
      run.failure = { reason: error.message, step: currentStep };
      await run.save();
    }
    notifier.emit(runId, {
      type: "FAILED",
      runId,
      reason: error.message,
      step: currentStep,
    });
    return { status: "FAILED", reason: error.message, step: currentStep };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}

/**
 * Resume a NEEDS_INPUT run after the user has provided answers.
 * Called by the API route, or by apply_resume() below.
 */
export async function resumeRun(runId, answers) {
  let browser, context, run;
  let currentStep = STEPS.OPEN_APPLICATION;

  try {
    run = await ApplicationRun.findOne({ runId });

    if (!run) {
      return { status: "FAILED", reason: `Run not found: ${runId}`, step: "resume" };
    }
    if (run.status !== "NEEDS_INPUT") {
      return {
        status: "FAILED",
        reason: `Cannot resume from status: ${run.status}`,
        step: "resume",
      };
    }

    const missingAnswers = run.missingFields.filter(
      (q) => answers[q.field] === undefined || answers[q.field] === null
    );
    if (missingAnswers.length > 0) {
      return { status: "NEEDS_INPUT", runId, questions: missingAnswers };
    }

    notifier.emit(runId, { type: "PROGRESS", step: STEPS.OPEN_APPLICATION, message: "Reopening application..." });

    run.status = "RUNNING";
    await run.save();

    ({ browser, context } = await createBrowserContext());
    const page = await context.newPage();
    await page.bringToFront();
    const adapter = createAdapter(run.ats, page);

    await adapter.openApplication(run.jobUrl);
    notifier.emit(runId, { type: "PROGRESS", step: STEPS.OPEN_APPLICATION, message: "Application reopened" });

    // ── Re-extract fields ───────────────────────────────────────────────────
    currentStep = STEPS.EXTRACT_FIELDS;
    const fields = await adapter.getFields();
    notifier.emit(runId, { type: "PROGRESS", step: STEPS.EXTRACT_FIELDS, message: `Found ${fields.length} fields` });

    // ── Refill profile fields ───────────────────────────────────────────────
    currentStep = STEPS.FILL_FIELDS;
    for (const field of fields) {
      if (field.name === "resume") continue;
      const mapping = mapFieldToProfile(field, run.profile);
      if (mapping.value !== null && mapping.value !== undefined) {
        console.log(`Filling ${field.name} → ${mapping.value}`);
        await adapter.fillField(field, mapping.value);
        notifier.emit(runId, { type: "PROGRESS", step: STEPS.FILL_FIELDS, message: `Filled ${field.name}` });
        await recordTrace(run, page, runId, { action: "fill", field: field.name, value: mapping.value, source: mapping.source });
      }
    }

    // ── Re-upload resume ────────────────────────────────────────────────────
    currentStep = STEPS.UPLOAD_RESUME;
    if (run.resumePath) {
      await adapter.uploadResume(run.resumePath);
      notifier.emit(runId, { type: "PROGRESS", step: STEPS.UPLOAD_RESUME, message: "Resume uploaded" });
      await recordTrace(run, page, runId, { action: "upload_resume", field: "resume", value: run.resumePath, source: "resumePath" });
    }

    // ── Fill user answers ───────────────────────────────────────────────────
    currentStep = STEPS.FILL_ANSWERS;
    for (const question of run.missingFields) {
      const answer = answers[question.field];
      const field = fields.find((f) => f.name === question.field);
      if (!field) throw new Error(`Field not found during resume: ${question.field}`);

      console.log(`Filling ${question.field} → ${JSON.stringify(answer)}`);
      await adapter.fillField(field, answer);
      notifier.emit(runId, { type: "PROGRESS", step: STEPS.FILL_ANSWERS, message: `Answered ${question.label}` });
      await recordTrace(run, page, runId, { action: "fill", field: question.field, value: answer, source: "user_answer" });
    }

    // ── Submit ──────────────────────────────────────────────────────────────
    currentStep = STEPS.SUBMIT;
    console.log("Submitting application...");
    notifier.emit(runId, { type: "PROGRESS", step: STEPS.SUBMIT, message: "Submitting application..." });

    const submissionResult = await adapter.submit();
    await recordTrace(run, page, runId, { action: "submit", field: "application", value: "submitted", source: `${run.ats}Adapter.submit` });

    console.log("Application submitted");

    run.answers = answers;
    run.receipt = submissionResult.receipt;
    run.confirmationText = submissionResult.confirmationText;
    run.status = "SUBMITTED";
    await run.save();

    notifier.emit(runId, { type: "SUBMITTED", runId, receipt: submissionResult.receipt });

    return {
      status: "SUBMITTED",
      runId,
      receipt: submissionResult.receipt,
      confirmation_text: submissionResult.confirmationText,
    };
  } catch (error) {
    console.error("Resume failed:", error);
    if (run) {
      run.status = "FAILED";
      run.failure = { reason: error.message, step: currentStep };
      await run.save();
    }
    notifier.emit(runId, { type: "FAILED", runId, reason: error.message, step: currentStep });
    return { status: "FAILED", reason: error.message, step: currentStep };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}

// ─── Backward-compatible wrappers for test scripts ────────────────────────────

/**
 * Legacy entry point used by testApplicationEngine.js.
 * Creates the DB record then calls applyRun().
 */
export async function apply(jobUrl, profile, resumePath) {
  const ats = detectATS(jobUrl);
  const runId = randomUUID();

  await ApplicationRun.create({
    runId,
    jobUrl,
    ats,
    profile,
    status: "RUNNING",
    resumePath: resumePath || null,
    trace: [],
  });

  console.log(`Starting application run: ${runId}`);
  console.log(`ATS detected: ${ats}`);

  return applyRun(runId);
}

/**
 * Legacy entry point used by testApplicationResume.js.
 */
export async function apply_resume(runId, answers) {
  return resumeRun(runId, answers);
}
