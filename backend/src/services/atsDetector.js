import { URL } from "url";

export function detectATS(jobUrl) {
  let hostname;

  try {
    hostname = new URL(jobUrl).hostname.toLowerCase();
  } catch (error) {
    throw new Error("Invalid job URL");
  }

  if (hostname === "jobs.lever.co") {
    return "lever";
  }

  if (
    hostname === "boards.greenhouse.io" ||
    hostname === "job-boards.greenhouse.io"
  ) {
    return "greenhouse";
  }

  if (hostname === "jobs.ashbyhq.com") {
    return "ashby";
  }

  if (hostname === "apply.workable.com") {
    return "workable";
  }

  throw new Error(`Unsupported ATS: ${hostname}`);
}