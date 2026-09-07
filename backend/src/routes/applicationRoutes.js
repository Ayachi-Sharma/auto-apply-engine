import { Router } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";

import { detectATS } from "../services/atsDetector.js";
import { ApplicationRun } from "../models/applicationRun.js";
import { applyRun, resumeRun } from "../services/applicationEngine.js";
import { subscribe, unsubscribe, emit } from "../services/notifier.js";

const router = Router();

// ─── Resume upload storage ────────────────────────────────────────────────────
const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Helper: build current-state SSE event from a run ────────────────────────
function buildStateEvent(run) {
  if (run.status === "NEEDS_INPUT") {
    return { type: "NEEDS_INPUT", runId: run.runId, questions: run.missingFields };
  }
  if (run.status === "SUBMITTED") {
    return { type: "SUBMITTED", runId: run.runId, receipt: run.receipt };
  }
  if (run.status === "FAILED") {
    return { type: "FAILED", runId: run.runId, ...run.failure };
  }
  return { type: "RUNNING", runId: run.runId, message: "Application is running..." };
}

// ─── POST /api/applications ───────────────────────────────────────────────────
// Start a new application. Returns 202 + runId immediately; runs in background.
router.post("/applications", upload.single("resume"), async (req, res) => {
  try {
    const { jobUrl, profile: profileRaw } = req.body;

    if (!jobUrl)      return res.status(400).json({ error: "jobUrl is required" });
    if (!profileRaw)  return res.status(400).json({ error: "profile is required" });

    let profile;
    try {
      profile = typeof profileRaw === "string" ? JSON.parse(profileRaw) : profileRaw;
    } catch {
      return res.status(400).json({ error: "profile must be valid JSON" });
    }

    const resumePath = req.file ? req.file.path : null;
    const ats = detectATS(jobUrl);
    const runId = randomUUID();

    await ApplicationRun.create({
      runId,
      jobUrl,
      ats,
      profile,
      status: "RUNNING",
      resumePath,
      trace: [],
    });

    // Return immediately with runId so the client can subscribe to SSE
    res.status(202).json({ runId, status: "RUNNING" });

    // Fire background job — no await
    applyRun(runId).catch((err) => {
      console.error(`[background] applyRun(${runId}) crashed:`, err.message);
      emit(runId, { type: "FAILED", runId, reason: err.message, step: "engine" });
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── POST /api/applications/:runId/resume ─────────────────────────────────────
// Provide user answers for a NEEDS_INPUT run and continue submission.
router.post("/applications/:runId/resume", async (req, res) => {
  try {
    const { runId } = req.params;
    const { answers } = req.body;

    if (!answers) return res.status(400).json({ error: "answers is required" });

    const run = await ApplicationRun.findOne({ runId });
    if (!run)                       return res.status(404).json({ error: "Run not found" });
    if (run.status !== "NEEDS_INPUT") {
      return res.status(400).json({ error: `Cannot resume from status: ${run.status}` });
    }

    // Validate all required answers provided
    const missing = run.missingFields.filter(
      (q) => answers[q.field] === undefined || answers[q.field] === null
    );
    if (missing.length > 0) {
      return res.status(400).json({
        error: "Missing answers for required fields",
        missingFields: missing.map((q) => q.field),
      });
    }

    // Return 202 immediately so the client re-subscribes to SSE
    res.status(202).json({ runId, status: "RUNNING" });

    // Background
    resumeRun(runId, answers).catch((err) => {
      console.error(`[background] resumeRun(${runId}) crashed:`, err.message);
      emit(runId, { type: "FAILED", runId, reason: err.message, step: "engine" });
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── GET /api/applications/:runId ─────────────────────────────────────────────
// Fetch current state of a run (polling fallback / debug).
router.get("/applications/:runId", async (req, res) => {
  try {
    const run = await ApplicationRun.findOne({ runId: req.params.runId });
    if (!run) return res.status(404).json({ error: "Run not found" });

    res.json({
      runId:         run.runId,
      status:        run.status,
      ats:           run.ats,
      jobUrl:        run.jobUrl,
      missingFields: run.missingFields,
      receipt:       run.receipt,
      failure:       run.failure,
      createdAt:     run.createdAt,
      updatedAt:     run.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/applications/:runId/events ──────────────────────────────────────
// SSE stream for live application events. No polling needed on the client.
router.get("/applications/:runId/events", async (req, res) => {
  const { runId } = req.params;

  // SSE headers
  res.setHeader("Content-Type",    "text/event-stream");
  res.setHeader("Cache-Control",   "no-cache");
  res.setHeader("Connection",      "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Replay current state so reconnecting clients don't miss terminal events
  try {
    const run = await ApplicationRun.findOne({ runId });
    if (run) {
      res.write(`data: ${JSON.stringify(buildStateEvent(run))}\n\n`);

      // If already in terminal state, close after replay
      if (["SUBMITTED", "FAILED"].includes(run.status)) {
        res.end();
        return;
      }
    } else {
      res.write(`data: ${JSON.stringify({ type: "ERROR", message: "Run not found" })}\n\n`);
      res.end();
      return;
    }
  } catch {
    // Continue anyway — fresh events will still arrive
  }

  // Register for live events
  subscribe(runId, res);

  // Keep-alive comment every 25s (prevents proxy timeouts)
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* client gone */ }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    unsubscribe(runId, res);
  });
});

export default router;
