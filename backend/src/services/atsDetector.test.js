import { detectATS } from "./atsDetector.js";

const testCases = [
  {
    url: "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164",
    expected: "lever",
  },
  {
    url: "https://job-boards.greenhouse.io/databricks/jobs/6918763002",
    expected: "greenhouse",
  },
  {
    url: "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application",
    expected: "ashby",
  },
  {
    url: "https://apply.workable.com/webuild-ai/j/5010161777/apply/",
    expected: "workable",
  },
];

console.log("Testing ATS detection...\n");

let passed = 0;

for (const test of testCases) {
  try {
    const result = detectATS(test.url);

    if (result === test.expected) {
      console.log(`✅ PASS: ${result}`);
      passed++;
    } else {
      console.log(
        `❌ FAIL: expected ${test.expected}, got ${result}`
      );
    }
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}`);
  }
}

console.log(`\n${passed}/${testCases.length} tests passed`);

console.log("\nTesting invalid URL...");

try {
  detectATS("not-a-valid-url");
  console.log("❌ FAIL: invalid URL was accepted");
} catch (error) {
  console.log(`✅ PASS: ${error.message}`);
}

console.log("\nTesting unsupported ATS...");

try {
  detectATS("https://example.com/job/123");
  console.log("❌ FAIL: unsupported ATS was accepted");
} catch (error) {
  console.log(`✅ PASS: ${error.message}`);
}