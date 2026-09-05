import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
});

const page = await browser.newPage();

await page.goto("https://example.com");

console.log("Page title:", await page.title());

await page.screenshot({
  path: "screenshots/playwright-test.png",
});

await browser.close();

console.log("✅ Playwright test completed");