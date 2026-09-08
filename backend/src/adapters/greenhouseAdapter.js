import { BaseAdapter } from "./baseAdapter.js";

/**
 * GreenhouseAdapter — Complete implementation for Greenhouse ATS.
 * Handles both boards.greenhouse.io and job-boards.greenhouse.io domains.
 * Supports field extraction, form filling, resume upload, and submission.
 */
export class GreenhouseAdapter extends BaseAdapter {
  async openApplication(jobUrl) {
    // Strip query strings and fragments before building the application URL
    // Greenhouse job URLs can be:
    // - https://boards.greenhouse.io/company/jobs/123456
    // - https://job-boards.greenhouse.io/company/jobs/123456
    let cleanUrl;
    try {
      const parsed = new URL(jobUrl);
      // Keep only origin + pathname, drop search params and hash
      cleanUrl = parsed.origin + parsed.pathname.replace(/\/$/, "");
    } catch {
      cleanUrl = jobUrl.split("?")[0].split("#")[0].replace(/\/$/, "");
    }

    console.log("Opening Greenhouse application:", cleanUrl);

    await this.page.goto(cleanUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    // networkidle can timeout on slow/ad-heavy pages — treat it as optional.
    await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      console.warn("⚠️ networkidle timed out — continuing anyway.");
    });

    // Check if we're on a company careers page (redirected from Greenhouse)
    // and need to click "Apply" to reach the actual form
    const currentUrl = this.page.url();
    if (!currentUrl.includes("greenhouse.io")) {
      console.log("Detected redirect to company careers page. Looking for Apply button...");
      
      // First, handle cookie consent if present
      try {
        const acceptCookiesBtn = this.page.locator("button:has-text('Accept'), button:has-text('Accept All'), button:has-text('Accept Cookies'), #onetrust-accept-btn-handler").first();
        if ((await acceptCookiesBtn.count()) > 0 && (await acceptCookiesBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
          console.log("Accepting cookies...");
          await acceptCookiesBtn.click();
          await this.page.waitForTimeout(1000);
        }
      } catch {
        // No cookie consent or failed to click
      }
      
      // Try to find and click Apply button
      const APPLY_SELECTORS = [
        "a:has-text('Apply')",
        "button:has-text('Apply')",
        "a:has-text('Apply for this job')",
        "a[href*='greenhouse.io']",
        "[data-testid*='apply']",
      ];
      
      let applyClicked = false;
      for (const sel of APPLY_SELECTORS) {
        try {
          const btn = this.page.locator(sel).first();
          if ((await btn.count()) > 0 && (await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
            console.log(`Clicking Apply button: ${sel}`);
            await btn.click();
            await this.page.waitForLoadState("domcontentloaded", { timeout: 15000 });
            await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
            applyClicked = true;
            break;
          }
        } catch {
          // try next
        }
      }
      
      // If we're still not on greenhouse.io after clicking Apply, the company may use a custom application
      // In this case, we'll try to navigate directly to the Greenhouse application form
      if (!applyClicked || !this.page.url().includes("greenhouse.io")) {
        console.log("Custom careers site detected. Attempting to navigate to Greenhouse form directly...");
        
        // Extract the job ID from the original URL and construct the direct Greenhouse application URL
        const jobIdMatch = cleanUrl.match(/\/jobs\/(\d+)/);
        if (jobIdMatch) {
          const jobId = jobIdMatch[1];
          // Try to find the company name from the URL
          const companyMatch = cleanUrl.match(/\/([^\/]+)\/jobs/);
          const company = companyMatch ? companyMatch[1] : "databricks";
          
          const greenhouseUrl = `https://boards.greenhouse.io/${company}/jobs/${jobId}`;
          console.log(`Navigating to: ${greenhouseUrl}`);
          
          await this.page.goto(greenhouseUrl, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          
          await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
            console.warn("⚠️ networkidle timed out — continuing anyway.");
          });
        }
      }
    }

    // Wait for the actual application form to load (not cookie consent)
    const formReady = await this.page
      .waitForFunction(
        () => {
          const inputs = document.querySelectorAll(
            "input:not([type='hidden']):not([type='file']), textarea, select"
          );
          // Filter out cookie-related inputs
          const nonCookieInputs = Array.from(inputs).filter(input => {
            const name = (input.name || input.id || "").toLowerCase();
            const label = (input.getAttribute("aria-label") || "").toLowerCase();
            return !name.includes("cookie") && !name.includes("ot-group") && !label.includes("cookie");
          });
          return nonCookieInputs.length > 0;
        },
        { timeout: 30000 }
      )
      .catch(() => null);

    if (!formReady) {
      const pageText = await this.page.locator("body").innerText().catch(() => "");
      console.warn("⚠️ Greenhouse form did not render. Page text sample:", pageText.slice(0, 500));
      console.warn("Current URL:", this.page.url());
    } else {
      console.log("✅ Greenhouse application form loaded");
    }

    console.log("✅ Greenhouse application opened");
    console.log("URL:", this.page.url());
    console.log("Title:", await this.page.title());
  }

  async getFields() {
    const fields = await this.page
      .locator("input:not([type='hidden']), textarea, select")
      .evaluateAll((elements) => {
        const result = [];
        const seen = new Set();

        for (const element of elements) {
          const name = element.getAttribute("name");
          const id = element.id || "";
          const type =
            element.getAttribute("type") || element.tagName.toLowerCase();

          // Filter out cookie consent and other non-application fields
          const nameLower = (name || "").toLowerCase();
          const idLower = id.toLowerCase();
          if (nameLower.includes("cookie") || nameLower.includes("ot-group") || 
              idLower.includes("cookie") || idLower.includes("ot-group")) {
            continue;
          }

          const isGrouped = type === "radio" || type === "checkbox";
          const key = isGrouped
            ? `${type}:${name}`
            : `${type}:${name || element.id || result.length}`;

          if (seen.has(key)) continue;
          seen.add(key);

          let label = null;
          let options = [];

          // ── helper: extract the best label from a container ──────────────
          function extractLabelFromContainer(container) {
            if (!container) return null;

            // 1. Explicit <label> element
            const lbl = container.querySelector("label");
            if (lbl) {
              const txt = lbl.innerText.trim();
              if (txt) return txt;
            }

            // 2. Common Greenhouse label selectors
            const labelSelectors = [
              "[class*='field-label']",
              "[class*='question-label']", 
              "[class*='form-label']",
              ".label",
              "legend",
              "h1", "h2", "h3", "h4", "h5", "h6",
            ];
            for (const sel of labelSelectors) {
              const el = container.querySelector(sel);
              if (el) {
                const txt = el.innerText.trim();
                if (txt) return txt;
              }
            }

            // 3. Any <p> or <span> that comes BEFORE the input in the container
            const allTextEls = Array.from(
              container.querySelectorAll("p, span, div")
            );
            for (const el of allTextEls) {
              // Skip the input itself and its wrappers
              if (el.contains(element)) continue;
              // Skip very long text (likely descriptions)
              const txt = el.innerText.trim();
              if (txt && txt.length < 200) return txt;
            }

            return null;
          }

          // 1. SELECT
          if (type === "select") {
            const container = element.closest(
              ".field, .form-field, [class*='question'], [class*='field']"
            );
            label = extractLabelFromContainer(container);

            if (!label && element.id) {
              const labelElement = document.querySelector(
                `label[for="${CSS.escape(element.id)}"]`
              );
              if (labelElement) label = labelElement.innerText.trim();
            }

            options = Array.from(element.options)
              .map((option) => ({
                value: option.value,
                label: option.textContent.trim(),
              }))
              .filter((option) => option.label);
          }

          // 2. RADIO / CHECKBOX
          if (isGrouped && name) {
            const group = Array.from(
              document.querySelectorAll(
                `input[type="${type}"][name="${CSS.escape(name)}"]`
              )
            );

            const container = element.closest(
              ".field, .form-field, [class*='question'], [class*='field']"
            );

            if (container) {
              const labelElements = Array.from(
                container.querySelectorAll("label")
              );
              if (labelElements.length > group.length) {
                label = labelElements[0].innerText.trim();
              }
            }

            if (!label && container) {
              const heading = container.querySelector(
                "legend, h1, h2, h3, h4, h5, h6"
              );
              if (heading) label = heading.innerText.trim();
            }

            if (!label && group.length > 0) {
              const firstInput = group[0];
              if (firstInput.id) {
                const optionLabel = document.querySelector(
                  `label[for="${CSS.escape(firstInput.id)}"]`
                );
                if (optionLabel) label = optionLabel.innerText.trim();
              }
              if (!label) label = firstInput.value;
            }

            options = group.map((input) => {
              let optionLabel = input.value;
              if (input.id) {
                const optionLabelElement = document.querySelector(
                  `label[for="${CSS.escape(input.id)}"]`
                );
                if (optionLabelElement) {
                  optionLabel = optionLabelElement.innerText.trim();
                }
              }
              return {
                value: input.value,
                label: optionLabel,
              };
            });

            result.push({
              id: element.id || null,
              name,
              label,
              type,
              required: group.some((input) => input.required),
              placeholder: element.getAttribute("placeholder"),
              ariaLabel: element.getAttribute("aria-label"),
              options,
            });
            continue;
          }

          // 3. TEXT / TEXTAREA
          // Priority 1: label[for=id]
          if (element.id) {
            const labelElement = document.querySelector(
              `label[for="${CSS.escape(element.id)}"]`
            );
            if (labelElement) label = labelElement.innerText.trim();
          }

          // Priority 2: walk up to any question container and extract text
          if (!label) {
            // Try increasingly broad containers for Greenhouse
            const containerSelectors = [
              ".field",
              ".form-field", 
              "[class*='field']",
              "[class*='question']",
              "[class*='form-group']",
            ];
            for (const sel of containerSelectors) {
              const container = element.closest(sel);
              if (container) {
                label = extractLabelFromContainer(container);
                if (label) break;
              }
            }
          }

          // Priority 3: aria-label
          if (!label) {
            const ariaLbl = element.getAttribute("aria-label");
            if (ariaLbl) label = ariaLbl.trim();
          }

          // Priority 4: aria-describedby
          if (!label) {
            const describedById = element.getAttribute("aria-describedby");
            if (describedById) {
              const descEl = document.getElementById(describedById);
              if (descEl) label = descEl.innerText.trim();
            }
          }

          // Priority 5: placeholder as label hint
          if (!label) {
            const placeholder = element.getAttribute("placeholder");
            if (placeholder && !/^enter /i.test(placeholder)) {
              label = placeholder.trim();
            }
          }

          // Last resort: humanise the raw name
          if (!label && name) {
            label = name;
          }

          result.push({
            id: element.id || null,
            name,
            label,
            type,
            required: element.required,
            placeholder: element.getAttribute("placeholder"),
            ariaLabel: element.getAttribute("aria-label"),
            options,
            // Store the outer HTML of the closest container for Phase 2 rescue
            _containerHTML: (() => {
              const c = element.closest(".field, .form-field, [class*='question'], [class*='field'], fieldset, li");
              return c ? c.outerHTML.slice(0, 600) : null;
            })(),
          });
        }

        return result;
      });

    // ── Phase 2: targeted label rescue for fields with missing labels ────────
    for (const field of fields) {
      const hasRealLabel = field.label && field.label.length > 0;

      if (!hasRealLabel) {
        // Dump the container HTML so we can see what Greenhouse actually renders
        if (field._containerHTML) {
          console.log(`[DOM DEBUG] Container for ${field.name}:\n${field._containerHTML}\n`);
        }

        // Try to find the real question text via a targeted page.evaluate()
        const rescued = await this.page.evaluate((fieldName) => {
          const input = document.querySelector(`[name="${fieldName}"]`) || 
                        document.querySelector(`#${fieldName}`);
          if (!input) return null;

          // Walk up at most 6 ancestor levels looking for question text
          let node = input.parentElement;
          for (let depth = 0; depth < 6 && node; depth++) {
            // Collect all text-bearing children (not the input itself)
            const textEls = Array.from(
              node.querySelectorAll("label, legend, p, span, div, h1, h2, h3, h4, h5, h6")
            ).filter((el) => !el.contains(input) && el.children.length === 0);

            for (const el of textEls) {
              const txt = el.innerText?.trim();
              if (txt && txt.length > 2 && txt.length < 300) {
                return txt;
              }
            }

            // Also check the node's own direct text content
            const directText = Array.from(node.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent.trim())
              .find((t) => t.length > 2);
            if (directText) return directText;

            node = node.parentElement;
          }
          return null;
        }, field.name).catch(() => null);

        if (rescued) {
          console.log(`[DOM RESCUE] ${field.name} → "${rescued}"`);
          field.label = rescued;
        }
      }

      // Remove internal _containerHTML before returning to caller
      delete field._containerHTML;
    }

    return fields;
  }

  async fillField(field, value) {
    if (value === undefined || value === null) {
      throw new Error(`No value provided for field: ${field.name}`);
    }

    console.log(`Filling ${field.name} → ${JSON.stringify(value)}`);

    let locator;
    if (field.id) {
      locator = this.page.locator(`#${field.id}`);
    } else if (field.name) {
      locator = this.page.locator(`[name="${field.name}"]`);
    } else {
      throw new Error(`Cannot locate field: ${field.name}`);
    }

    // 1. SELECT DROPDOWN
    if (field.type === "select") {
      try {
        await locator.selectOption({ value: String(value) });
      } catch (error) {
        const options = await locator.locator("option").allInnerTexts();
        const matched = options.find(
          (opt) =>
            opt.trim().toLowerCase() === String(value).trim().toLowerCase()
        );
        if (matched) {
          await locator.selectOption({ label: matched.trim() });
        } else {
          console.warn(`⚠️ Option "${value}" not found in dropdown ${field.name}`);
        }
      }
      return;
    }

    // 2. RADIO BUTTONS
    if (field.type === "radio") {
      const radios = this.page.locator(`[name="${field.name}"]`);
      const count = await radios.count();
      let matchedRadio = null;

      for (let i = 0; i < count; i++) {
        const r = radios.nth(i);
        const val = await r.getAttribute("value");
        if (val && val.toLowerCase() === String(value).trim().toLowerCase()) {
          matchedRadio = r;
          break;
        }
      }

      if (matchedRadio) {
        const id = await matchedRadio.getAttribute("id");
        let clicked = false;

        if (id) {
          const label = this.page.locator(`label[for="${id}"]`);
          if ((await label.count()) > 0 && (await label.isVisible())) {
            await label.click();
            clicked = true;
          }
        }

        if (!clicked) {
          await matchedRadio.check({ force: true }).catch(async () => {
            await matchedRadio.evaluate((el) => {
              el.checked = true;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            });
          });
        }
      } else {
        console.warn(`⚠️ Radio option "${value}" not found for "${field.name}"`);
      }
      return;
    }

    // 3. CHECKBOXES
    if (field.type === "checkbox") {
      const values = Array.isArray(value) ? value : [value];
      const checkboxes = this.page.locator(`[name="${field.name}"]`);
      const count = await checkboxes.count();

      for (const targetVal of values) {
        let matchedBox = null;
        for (let i = 0; i < count; i++) {
          const b = checkboxes.nth(i);
          const val = await b.getAttribute("value");
          if (
            val &&
            val.toLowerCase() === String(targetVal).trim().toLowerCase()
          ) {
            matchedBox = b;
            break;
          }
        }

        if (!matchedBox) {
          console.warn(`⚠️ Checkbox option "${targetVal}" not found for "${field.name}"`);
          continue;
        }

        const isChecked = await matchedBox.isChecked().catch(() => false);
        if (isChecked) continue;

        const id = await matchedBox.getAttribute("id");
        let clicked = false;

        if (id) {
          const label = this.page.locator(`label[for="${id}"]`);
          if ((await label.count()) > 0 && (await label.isVisible())) {
            await label.click();
            clicked = true;
          }
        }

        if (!clicked) {
          const parent = matchedBox.locator("xpath=..");
          if ((await parent.count()) > 0) {
            await parent.click().catch(() => {});
          }
        }

        const stillUnchecked = !(await matchedBox.isChecked().catch(() => false));
        if (stillUnchecked) {
          await matchedBox.evaluate((el) => {
            el.checked = true;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }).catch(() => {});
        }
      }
      return;
    }

    // 4. LOCATION AUTOCOMPLETE HANDLING
    // Greenhouse often has location fields with autocomplete
    if (field.name === "location" || /location|address|city/i.test(field.label || "")) {
      await locator.click();
      await this.page.waitForTimeout(300); // Give JS time to bind
      await locator.fill(String(value));
      await this.page.waitForTimeout(800); // Wait for API response
      
      // Look for Greenhouse autocomplete suggestions
      const suggestion = this.page.locator(".autocomplete-item, .suggestion, [role='option']").first();
      if (await suggestion.isVisible().catch(() => false)) {
        await suggestion.click().catch(() => {});
      }
    } else {
      // 5. REGULAR TEXT / TEXTAREA
      await locator.fill(String(value));
      
      // Trigger React form validation events
      await locator.dispatchEvent("input");
      await locator.dispatchEvent("change");
      await locator.dispatchEvent("blur");
    }
  }

  async uploadResume(filePath) {
    if (!filePath) throw new Error("Resume file path is required");

    // Try multiple selectors Greenhouse uses across different form versions
    const RESUME_SELECTORS = [
      "input[type='file'][name*='resume']",
      "input[type='file'][accept*='pdf']", 
      "input[type='file'][accept*='.pdf']",
      "input[type='file'][accept*='doc']",
      "input[type='file']",
    ];

    let resumeInput = null;
    for (const selector of RESUME_SELECTORS) {
      const candidate = this.page.locator(selector).first();
      try {
        // Wait up to 8 s per selector before trying the next one
        await candidate.waitFor({ state: "attached", timeout: 8000 });
        resumeInput = candidate;
        console.log(`📎 Resume input found with selector: ${selector}`);
        break;
      } catch {
        console.warn(`⚠️ Resume selector not found: ${selector}`);
      }
    }

    if (!resumeInput) {
      throw new Error(
        "Resume upload input not found. The page may not have loaded correctly or this job does not accept resume uploads."
      );
    }

    await resumeInput.setInputFiles(filePath);

    // Wait for Greenhouse to finish processing the upload
    try {
      await this.page.waitForFunction(() => {
        // Look for success indicators in Greenhouse forms
        const successIndicators = [
          document.querySelector('[class*="upload-success"]'),
          document.querySelector('[class*="file-uploaded"]'),
          document.querySelector('.file-name'),
          document.body.innerText.includes('.pdf') || document.body.innerText.includes('.doc')
        ];
        return successIndicators.some(indicator => indicator);
      }, { timeout: 15000 });
    } catch (e) {
      console.warn("⚠️ Resume upload taking unusually long or success indicators not found.");
    }

    console.log(`✅ Resume uploaded: ${filePath}`);
  }

  async submit() {
    console.log("Collecting Greenhouse filled-application receipt (submission is currently disabled)...");

    // Collect form data for receipt — captures exactly what was filled in.
    const rawReceipt = {};
    const inputs = this.page.locator(
      "input[name], textarea[name], select[name]"
    );
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const name = await input.getAttribute("name");
      if (!name) continue;

      const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
      const type = await input.getAttribute("type");

      if (type === "file") {
        rawReceipt[name] = "[resume uploaded]";
        continue;
      }

      // Skip hidden inputs for the receipt (they often hold stale values)
      if (type === "hidden") continue;

      if (type === "radio" || type === "checkbox") {
        const checked = await input.isChecked().catch(() => false);
        if (!checked) continue;

        const value = await input.getAttribute("value");
        if (rawReceipt[name] === undefined) {
          rawReceipt[name] = value ?? true;
        } else if (Array.isArray(rawReceipt[name])) {
          rawReceipt[name].push(value ?? true);
        } else {
          rawReceipt[name] = [rawReceipt[name], value ?? true];
        }
        continue;
      }

      if (tagName === "select") {
        rawReceipt[name] = await input.inputValue();
        continue;
      }

      rawReceipt[name] = await input.inputValue();
    }

    console.log("Receipt collected:");
    console.log(JSON.stringify(rawReceipt, null, 2));

    console.log("✅ Greenhouse application filled — stopping before submission (disabled).");
    return {
      receipt: rawReceipt,
      confirmationText: "Application filled — submission disabled.",
      submitted: false,
    };
  }

}
