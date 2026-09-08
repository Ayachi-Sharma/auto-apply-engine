import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { WorkableAdapter } from "./src/adapters/workableAdapter.js";

chromium.use(stealthPlugin());

async function testWorkableFinal() {
  console.log("Testing improved Workable adapter with aria-labelledby support...");
  
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

  const page = await context.newPage();
  const adapter = new WorkableAdapter(page);

  try {
    const jobUrl = "https://apply.workable.com/webuild-ai/j/5010161777/apply/";
    await adapter.openApplication(jobUrl);
    
    console.log("\nExtracting fields...");
    const fields = await adapter.getFields();
    console.log(`Found ${fields.length} fields:\n`);
    
    fields.forEach(f => {
      console.log(`Field: ${f.name} (${f.type})`);
      console.log(`  Label: ${f.label || 'No label'}`);
      if (f.options && f.options.length > 0) {
        console.log(`  Options:`);
        f.options.forEach(opt => {
          console.log(`    - Value: "${opt.value}" | Label: "${opt.label}"`);
        });
      }
      console.log("");
    });
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

testWorkableFinal();
