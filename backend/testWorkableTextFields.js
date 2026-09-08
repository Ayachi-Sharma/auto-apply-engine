import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

chromium.use(stealthPlugin());

async function testWorkableTextFields() {
  console.log("Testing Workable text field extraction...");
  
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

  try {
    const jobUrl = "https://apply.workable.com/webuild-ai/j/5010161777/apply/";
    await page.goto(jobUrl, { waitUntil: "networkidle" });
    
    // Wait for form to load
    await page.waitForTimeout(3000);
    
    console.log("Page loaded. Inspecting text field DOM structure...\n");
    
    const textFields = await page.evaluate(() => {
      const results = [];
      const allInputs = document.querySelectorAll("input");
      
      console.log("Total inputs found:", allInputs.length);
      
      allInputs.forEach(input => {
        const type = input.type;
        const name = input.name;
        const id = input.id;
        const placeholder = input.getAttribute("placeholder");
        
        // Get parent container - try broader selectors
        const container = input.closest("li, .form-field, fieldset, div[class*='question'], div[class*='field'], div[class*='input'], div[class*='form']");
        
        // Check for aria-labelledby on input
        const ariaLabelledBy = input.getAttribute("aria-labelledby");
        let ariaLabelText = null;
        if (ariaLabelledBy) {
          const ids = ariaLabelledBy.split(/\s+/);
          for (const ariaId of ids) {
            const ariaLabelElement = document.getElementById(ariaId);
            if (ariaLabelElement) {
              ariaLabelText = ariaLabelElement.innerText;
              break;
            }
          }
        }
        
        // Check for aria-labelledby on container
        const containerAriaLabelledBy = container ? container.getAttribute("aria-labelledby") : null;
        let containerAriaLabelText = null;
        if (containerAriaLabelledBy) {
          const ids = containerAriaLabelledBy.split(/\s+/);
          for (const ariaId of ids) {
            const ariaLabelElement = document.getElementById(ariaId);
            if (ariaLabelElement) {
              containerAriaLabelText = ariaLabelElement.innerText;
              break;
            }
          }
        }
        
        // Check for aria-labelledby on parent (for gdpr, phone)
        const parent = input.parentElement;
        const parentAriaLabelledBy = parent ? parent.getAttribute("aria-labelledby") : null;
        let parentAriaLabelText = null;
        if (parentAriaLabelledBy) {
          const ids = parentAriaLabelledBy.split(/\s+/);
          for (const ariaId of ids) {
            const ariaLabelElement = document.getElementById(ariaId);
            if (ariaLabelElement) {
              parentAriaLabelText = ariaLabelElement.innerText;
              break;
            }
          }
        }
        
        // Look for label[for=id]
        let labelForText = null;
        if (id) {
          const labelFor = document.querySelector(`label[for="${id}"]`);
          if (labelFor) {
            labelForText = labelFor.innerText;
          }
        }
        
        // Look for label by data-ui attribute
        let dataUiLabel = null;
        const dataUi = input.getAttribute("data-ui");
        if (dataUi) {
          const labelByDataUi = document.querySelector(`[data-ui="${dataUi}_label"]`);
          if (labelByDataUi) {
            dataUiLabel = labelByDataUi.innerText;
          }
        }
        
        // Look for any element with data-ui that ends with _label and contains the field name
        let labelByDataUiSearch = null;
        if (dataUi) {
          const allLabelElements = document.querySelectorAll("[data-ui]");
          for (const el of allLabelElements) {
            const elDataUi = el.getAttribute("data-ui");
            if (elDataUi && elDataUi.endsWith("_label") && elDataUi.includes(dataUi)) {
              labelByDataUiSearch = el.innerText;
              break;
            }
          }
        }
        
        // Always include the field, even if no container found
        let textsParsed = null;
        const textsAttr = input.getAttribute("texts");
        if (textsAttr) {
          try {
            textsParsed = JSON.parse(textsAttr);
          } catch {
            textsParsed = textsAttr;
          }
        }
        
        // Try to access the texts property directly from the input element
        let textsProperty = null;
        if (input.texts && typeof input.texts === 'object') {
          textsProperty = JSON.stringify(input.texts);
        }
        
        results.push({
          type,
          name,
          id,
          placeholder,
          ariaLabelledBy,
          ariaLabelText,
          containerAriaLabelledBy,
          containerAriaLabelText,
          parentAriaLabelledBy,
          parentAriaLabelText,
          labelForText,
          dataUiLabel,
          labelByDataUiSearch,
          hasContainer: !!container,
          containerHTML: container ? container.outerHTML.slice(0, 1000) : null,
          containerText: container ? container.innerText.slice(0, 300) : null,
          parentHTML: input.parentElement ? input.parentElement.outerHTML.slice(0, 500) : null,
          textsAttr,
          textsParsed,
          textsProperty,
          dataUi
        });
      });
      
      return results;
    });
    
    console.log("Text field DOM structure:");
    textFields.forEach((item, idx) => {
      console.log(`\n[${idx}] ${item.name} (type: ${item.type}, id: ${item.id})`);
      console.log(`Placeholder: ${item.placeholder}`);
      console.log(`aria-labelledby (input): ${item.ariaLabelledBy}`);
      console.log(`aria label text (input): ${item.ariaLabelText}`);
      console.log(`aria-labelledby (container): ${item.containerAriaLabelledBy}`);
      console.log(`aria label text (container): ${item.containerAriaLabelText}`);
      console.log(`aria-labelledby (parent): ${item.parentAriaLabelledBy}`);
      console.log(`aria label text (parent): ${item.parentAriaLabelText}`);
      console.log(`label[for=id]: ${item.labelForText}`);
      console.log(`data-ui: ${item.dataUi}`);
      console.log(`data-ui label: ${item.dataUiLabel}`);
      console.log(`texts attribute: ${item.textsAttr}`);
      console.log(`texts parsed:`, item.textsParsed);
      console.log(`Parent HTML: ${item.parentHTML}`);
    });
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

testWorkableTextFields();
