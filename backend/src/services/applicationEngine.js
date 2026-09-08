import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { detectATS } from "./atsDetector.js";
import { mapFieldToProfile, getMissingFields } from "./fieldMapper.js";

import { LeverAdapter } from "../adapters/leverAdapter.js";
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
  FINALIZE:         "finalize",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a user-facing summary of every field that was filled in the form,
 * pairing the extracted label (if any) with its current form value.
 * This is what the frontend shows when the automation stops before submission.
 */
export function buildFilledPreview(fields, receipt, trace = []) {
  const captured = { ...(receipt || {}) };
  for (const event of trace || []) {
    if (event.action === "fill" && event.field && event.value !== undefined) {
      captured[event.field] = event.value;
    }
  }
  const preview = [];
  const representedKeys = new Set();

  for (const field of fields || []) {
    if (!field || !field.name) continue;
    const receiptKey = [field.name, field.id, field.label]
      .find((key) => key && captured[key] !== undefined && captured[key] !== null);
    if (!receiptKey) continue;

    preview.push({
      name: field.name,
      label: field.label || field.name,
      type: field.type,
      value: captured[receiptKey],
    });
    representedKeys.add(receiptKey);
  }

  // Keep adapter-captured values even when a dynamic ATS control was not
  // present in the persisted field schema.
  for (const [name, value] of Object.entries(captured)) {
    if (representedKeys.has(name) || value === undefined || value === null) continue;
    preview.push({
      name,
      label: name.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      type: Array.isArray(value) ? "checkbox" : "text",
      value,
    });
  }

  return preview;
}
function createAdapter(ats, page) {
  switch (ats) {
    case "lever":      return new LeverAdapter(page);
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
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 10000 });
  } catch {
    console.warn(`Screenshot skipped for ${safeFieldName}: page is navigating.`);
  }

  run.trace.push({ ...data, screenshot: screenshotPath, timestamp: new Date().toISOString() });
  await run.save();
}

// ─── Core engine functions ────────────────────────────────────────────────────

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
        try {
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
        } catch (err) {
          console.warn(`⚠️ Failed to fill ${field.name}: ${err.message} — continuing`);
          await recordTrace(run, page, runId, {
            action: "fill_error",
            field: field.name,
            value: mapping.value,
            source: mapping.source,
            error: err.message,
          }).catch(() => {});
        }
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

    // ── Finalize — collect a receipt of what was filled in ───────────────────
    // Submission is currently disabled: the automation stops immediately before
    // clicking the "Submit Application" button and reports what was filled.
    currentStep = STEPS.FINALIZE;
    console.log("Finalizing filled application...");
    notifier.emit(runId, {
      type: "PROGRESS",
      step: STEPS.FINALIZE,
      message: "Collecting filled-application data...",
    });

    const finalizeResult = await adapter.submit();

    await recordTrace(run, page, runId, {
      action: "finalize",
      field: "application",
      value: finalizeResult.submitted ? "submitted" : "filled",
      source: `${ats}Adapter.submit`,
    });

    run.receipt = finalizeResult.receipt;
    run.confirmationText = finalizeResult.confirmationText;

    if (finalizeResult.submitted === false) {
      // Automation stopped before the real submission click.
      run.status = "FILLED";
      await run.save();

      notifier.emit(runId, {
        type: "FILLED",
        runId,
        receipt: finalizeResult.receipt,
        confirmationText: finalizeResult.confirmationText,
        filledPreview: buildFilledPreview(run.fields, finalizeResult.receipt, run.trace),
      });

      return {
        status: "FILLED",
        runId,
        receipt: finalizeResult.receipt,
        confirmationText: finalizeResult.confirmationText,
        filledPreview: buildFilledPreview(run.fields, finalizeResult.receipt, run.trace),
      };
    }

    console.log("Application submitted");
    run.status = "SUBMITTED";
    await run.save();

    notifier.emit(runId, {
      type: "SUBMITTED",
      runId,
      receipt: finalizeResult.receipt,
    });

    return {
      status: "SUBMITTED",
      runId,
      receipt: finalizeResult.receipt,
      confirmation_text: finalizeResult.confirmationText,
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
        try {
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
        } catch (err) {
          console.warn(`⚠️ Failed to fill ${field.name}: ${err.message} — continuing`);
          await recordTrace(run, page, runId, {
            action: "fill_error",
            field: field.name,
            value: mapping.value,
            source: mapping.source,
            error: err.message,
          }).catch(() => {});
        }
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
      try {
        await adapter.fillField(field, answer);
        notifier.emit(runId, {
          type: "PROGRESS",
          step: STEPS.FILL_ANSWERS,
          message: `Answered ${question.label}`,
        });
        await recordTrace(run, page, runId, {
          action: "fill",
          field: question.field,
          value: answer,
          source: "user_answer",
        });
      } catch (err) {
        console.warn(`⚠️ Failed to fill answer ${question.field}: ${err.message} — continuing`);
        await recordTrace(run, page, runId, {
          action: "fill_error",
          field: question.field,
          value: answer,
          source: "user_answer",
          error: err.message,
        }).catch(() => {});
      }
    }

    // ── Finalize — collect a receipt of what was filled in ───────────────────
    // Submission is currently disabled: the automation stops immediately before
    // clicking the "Submit Application" button and reports what was filled.
    currentStep = STEPS.FINALIZE;
    console.log("Finalizing filled application...");
    notifier.emit(runId, {
      type: "PROGRESS",
      step: STEPS.FINALIZE,
      message: "Collecting filled-application data...",
    });

    const finalizeResult = await adapter.submit();
    await recordTrace(run, page, runId, {
      action: "finalize",
      field: "application",
      value: finalizeResult.submitted ? "submitted" : "filled",
      source: `${run.ats}Adapter.submit`,
    });

    run.answers = answers;
    run.receipt = finalizeResult.receipt;
    run.confirmationText = finalizeResult.confirmationText;

    if (finalizeResult.submitted === false) {
      run.status = "FILLED";
      await run.save();

      notifier.emit(runId, {
        type: "FILLED",
        runId,
        receipt: finalizeResult.receipt,
        confirmationText: finalizeResult.confirmationText,
        filledPreview: buildFilledPreview(run.fields, finalizeResult.receipt, run.trace),
      });

      return {
        status: "FILLED",
        runId,
        receipt: finalizeResult.receipt,
        confirmationText: finalizeResult.confirmationText,
        filledPreview: buildFilledPreview(run.fields, finalizeResult.receipt, run.trace),
      };
    }

    console.log("Application submitted");

    run.status = "SUBMITTED";
    await run.save();

    notifier.emit(runId, { type: "SUBMITTED", runId, receipt: finalizeResult.receipt });

    return {
      status: "SUBMITTED",
      runId,
      receipt: finalizeResult.receipt,
      confirmation_text: finalizeResult.confirmationText,
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

export async function apply_resume(runId, answers) {
  return resumeRun(runId, answers);
}