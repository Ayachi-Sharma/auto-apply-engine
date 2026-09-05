import { BaseAdapter } from "./baseAdapter.js";

const adapter = new BaseAdapter({});

console.log("Testing BaseAdapter...\n");

const methods = [
  "openApplication",
  "getFields",
  "fillField",
  "uploadResume",
  "submit",
];

for (const method of methods) {
  if (typeof adapter[method] === "function") {
    console.log(`✅ ${method} exists`);
  } else {
    console.log(`❌ ${method} missing`);
  }
}

console.log("\nTesting abstract methods...\n");

try {
  await adapter.getFields();
  console.log("❌ FAIL: getFields() should not be usable directly");
} catch (error) {
  console.log(`✅ PASS: ${error.message}`);
}