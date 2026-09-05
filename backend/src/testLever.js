import { chromium } from "playwright";
import { LeverAdapter } from "./adapters/leverAdapter.js";

const jobUrl =
  "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164";

const browser = await chromium.launch({
  headless: false,
});

const page = await browser.newPage();

const adapter = new LeverAdapter(page);

try {
  await adapter.openApplication(jobUrl);

  const fields = await adapter.getFields();

  console.log("\n========== FORM FIELDS ==========\n");

  // console.table(fields);
console.log(
  JSON.stringify(fields, null, 2)
);
  console.log(`\nTotal fields found: ${fields.length}`);

  await page.screenshot({
    path: "screenshots/lever-form.png",
    fullPage: true,
  });

  console.log("\n✅ Lever field inspection completed");
} catch (error) {
  console.error("\n❌ Lever inspection failed");
  console.error(error);
} finally {
  await browser.close();
}

// import { chromium } from "playwright";
// import { LeverAdapter } from "./adapters/leverAdapter.js";

// const jobUrl =
//   "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164";

// const browser = await chromium.launch({
//   headless: false,
// });

// const page = await browser.newPage();

// const adapter = new LeverAdapter(page);

// try {
//   await adapter.openApplication(jobUrl);

//   console.log("\n========== PAGE INFO ==========\n");

//   console.log("URL:", page.url());
//   console.log("Title:", await page.title());

//   console.log("\n========== BUTTONS ==========\n");

//   const buttons = await page.locator("button, a").evaluateAll((elements) =>
//     elements.map((element) => ({
//       tag: element.tagName.toLowerCase(),
//       text: element.innerText?.trim(),
//       href: element.getAttribute("href"),
//       type: element.getAttribute("type"),
//     }))
//   );

//   console.table(buttons);

//   console.log("\n========== PAGE TEXT ==========\n");

//   const text = await page.locator("body").innerText();

//   console.log(text.slice(0, 5000));

//   await page.screenshot({
//     path: "screenshots/lever-page.png",
//     fullPage: true,
//   });

//   console.log("\n✅ Inspection completed");
// } catch (error) {
//   console.error("\n❌ Inspection failed");
//   console.error(error);
// } finally {
//   await browser.close();
// }


// import { chromium } from "playwright";
// import { LeverAdapter } from "./adapters/leverAdapter.js";

// const jobUrl =
//   "https://jobs.lever.co/leverdemo/18c23ab2-ac77-473b-b2aa-ba13e0d52164";

// const browser = await chromium.launch({
//   headless: false,
// });

// const page = await browser.newPage();

// const adapter = new LeverAdapter(page);

// try {
//   await adapter.openApplication(jobUrl);

//   const fields = await adapter.getFields();

//   console.log("\n========== FORM FIELDS ==========\n");

//   console.table(fields);

//   console.log(`\nTotal fields found: ${fields.length}`);

//   await page.screenshot({
//     path: "screenshots/lever-form.png",
//     fullPage: true,
//   });

//   console.log("\n✅ Lever inspection completed");
//   console.log("Screenshot saved: screenshots/lever-form.png");
// } catch (error) {
//   console.error("\n❌ Lever inspection failed");
//   console.error(error);
// } finally {
//   await browser.close();
// }