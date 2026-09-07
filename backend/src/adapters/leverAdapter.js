import { BaseAdapter } from "./baseAdapter.js";

export class LeverAdapter extends BaseAdapter {
  async openApplication(jobUrl) {
    // Strip query strings and fragments before building the application URL.
    // e.g. "https://jobs.lever.co/acme?utm_source=x" → "https://jobs.lever.co/acme/apply"
    let cleanUrl;
    try {
      const parsed = new URL(jobUrl);
      // Keep only origin + pathname, drop search params and hash
      cleanUrl = parsed.origin + parsed.pathname.replace(/\/$/, "");
    } catch {
      cleanUrl = jobUrl.split("?")[0].split("#")[0].replace(/\/$/, "");
    }

    const applicationUrl = cleanUrl.endsWith("/apply")
      ? cleanUrl
      : `${cleanUrl}/apply`;

    console.log("Opening Lever application:", applicationUrl);

    await this.page.goto(applicationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    // networkidle can timeout on slow/ad-heavy pages — treat it as optional.
    await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      console.warn("⚠️ networkidle timed out — continuing anyway.");
    });

    console.log("✅ Lever application opened");
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
          if (
            element.id === "customPronounsOption" ||
            element.id === "customPronounsTextField"
          ) {
            continue;
          }

          const name = element.getAttribute("name");
          const type =
            element.getAttribute("type") || element.tagName.toLowerCase();

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

            // 2. Common Lever label selectors (ordered by specificity)
            const labelSelectors = [
              ".application-label",
              "[class*='application-label']",
              "[class*='question-label']",
              "[class*='question-title']",
              "[class*='question-text']",
              "[class*='field-label']",
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
              ".application-question, .question, .field"
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
              ".application-question, .question, .field"
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
            // Try increasingly broad containers
            const containerSelectors = [
              ".application-question",
              ".question",
              ".field",
              "[class*='application-question']",
              "[class*='custom-question']",
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
            if (/^cards\[/.test(name)) {
              const fieldPart = name.match(/\[([^\]]+)\]\s*$/);
              label = fieldPart ? `Additional question (${fieldPart[1]})` : "Additional question";
            } else {
              label = name;
            }
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
              const c = element.closest(".application-question, .question, [class*='question'], [class*='form-group'], fieldset, li, .field");
              return c ? c.outerHTML.slice(0, 600) : null;
            })(),
          });
        }

        return result;
      });

    // ── Phase 2: targeted label rescue for card fields ────────────────────
    // For any cards[uuid][fieldN] field that still has a generic/missing label,
    // use a separate page.evaluate() per input to walk the live DOM more freely.
    for (const field of fields) {
      const isCardField = field.name && /^cards\[/.test(field.name);
      const hasRealLabel =
        field.label &&
        !/^Additional question/.test(field.label) &&
        !/^cards\[/.test(field.label);

      if (isCardField && !hasRealLabel) {
        // Dump the container HTML so we can see what Lever actually renders
        if (field._containerHTML) {
          console.log(`[DOM DEBUG] Container for ${field.name}:\n${field._containerHTML}\n`);
        }

        // Try to find the real question text via a targeted page.evaluate()
        const rescued = await this.page.evaluate((fieldName) => {
          const input = document.querySelector(`[name="${fieldName}"]`);
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

    // Auto-correct Disability Signature Date to today's date
    if (field.name === "eeo[disabilitySignatureDate]") {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const yyyy = today.getFullYear();
      value = `${mm}/${dd}/${yyyy}`;
      console.log(`Filling ${field.name} → "${value}" (auto-corrected to today)`);
    } else {
      console.log(`Filling ${field.name} → ${JSON.stringify(value)}`);
    }

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

    // 4. TEXT / LOCATION
    await locator.fill(String(value));

    // Inside LeverAdapter.js -> fillField()
    // 4. TEXT / LOCATION
    if (field.name === "location") {
      await locator.click();
      await this.page.waitForTimeout(300); // Give JS time to bind
      await locator.fill(String(value));
      await this.page.waitForTimeout(800); // Wait for API response
      
      const suggestion = this.page.locator(".location-item, .tt-suggestion").first();
      if (await suggestion.isVisible().catch(() => false)) {
        await suggestion.click().catch(() => {});
      }
    } else {
      await locator.fill(String(value));
    }
  }

  async uploadResume(filePath) {
    if (!filePath) throw new Error("Resume file path is required");

    // Try multiple selectors Lever uses across different form versions
    const RESUME_SELECTORS = [
      "#resume-upload-input",
      "input[type='file'][name='resume']",
      "input[type='file'][accept*='pdf']",
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

    // Wait for Lever to finish the AWS upload and populate the hidden storage ID
    try {
      await this.page.waitForFunction(() => {
        const hiddenInput = document.querySelector('input[name="resumeStorageId"]');
        return hiddenInput && hiddenInput.value.length > 5;
      }, { timeout: 15000 });
    } catch (e) {
      console.warn("⚠️ Resume upload taking unusually long or storage ID not found.");
    }

    console.log(`✅ Resume uploaded: ${filePath}`);
  }

    async submit() {
    console.log("Submitting Lever application...");

    // Internal Lever fields that are NOT part of the application data.
    // We strip these from the user-facing receipt.
    const INTERNAL_FIELDS = new Set([
      "h-captcha-response",
      "origin",
      "referer",
      "timezone",
      "accountId",
      "linkedInData",
      "socialReferralKey",
      "socialSource",
      "selectedLocation",
      "source",
    ]);
    const isInternalField = (name) =>
      INTERNAL_FIELDS.has(name) ||
      name.endsWith("[baseTemplate]") ||
      name.endsWith("[surveyId]");

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

      // Skip hidden inputs — they often hold stale or internal values.
      // Checkboxes/radios are the authoritative source for their field names.
      if (type === "hidden") {
        // Still capture non-internal hidden fields we want to keep
        if (!isInternalField(name)) {
          const value = await input.getAttribute("value");
          // Only record if not already set by a visible input
          if (rawReceipt[name] === undefined && value) {
            rawReceipt[name] = value;
          }
        }
        continue;
      }

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

    // Build clean, user-facing receipt (no internal metadata)
    const receipt = Object.fromEntries(
      Object.entries(rawReceipt).filter(([key]) => !isInternalField(key))
    );

    console.log("Receipt collected:");
    console.log(JSON.stringify(receipt, null, 2));

    const submitButton = this.page.locator("#btn-submit");
    await submitButton.waitFor({ state: "visible", timeout: 10000 });
    console.log("Submit button found");

    // 1. Capture submission network responses
    let postResponse = null;
    const capturePostResponse = async (res) => {
      if (res.url().includes("/apply") && res.request().method() === "POST") {
        postResponse = res;
        console.log(`[Network Log] Caught POST response: ${res.status()}`);
      }
    };
    this.page.on("response", capturePostResponse);

    // 2. Force-reset the hCaptcha widget and execute it fresh.
    //    Tokens generated during form-filling are stale by submit time (they
    //    expire in ~2 min). We must get a brand-new token right before clicking.
    console.log("Refreshing hCaptcha token before submit...");
    await this.page.evaluate(() => {
      try {
        if (window.hcaptcha && typeof window.hcaptcha.reset === "function") {
          window.hcaptcha.reset();
        }
      } catch (e) {}
    });

    // Give the widget a moment to reset, then execute it to get a fresh token
    await this.page.waitForTimeout(1000);
    await this.page.evaluate(() => {
      try {
        if (window.hcaptcha && typeof window.hcaptcha.execute === "function") {
          window.hcaptcha.execute();
        }
      } catch (e) {}
    });

    // Wait up to 30s for a fresh token to appear
    const hcaptchaReady = await this.page.waitForFunction(
      () => {
        const responseInput = document.querySelector(
          'textarea[name="h-captcha-response"], input[name="h-captcha-response"]'
        );
        if (responseInput && responseInput.value && responseInput.value.length > 10) {
          return true;
        }
        if (window.hcaptcha && typeof window.hcaptcha.getResponse === "function") {
          try {
            const response = window.hcaptcha.getResponse();
            return response && response.length > 10;
          } catch (e) {}
        }
        return false;
      },
      { timeout: 30000 }
    ).catch(() => null);

    if (hcaptchaReady) {
      console.log("✅ Fresh hCaptcha token ready — proceeding to submit.");
    } else {
      console.log("⚠️ hCaptcha token not ready. The challenge may appear after submit.");
    }

    // 3. Click the submit button.
    //    After hcaptcha.reset(), the widget iframe can expand and overlay the
    //    button, causing hover() to fail with a pointer-interception error.
    //    We scroll it into view then use force:true to bypass the overlay check.
    //    If that still fails, we fall back to a direct JS click.
    await submitButton.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(300);
    try {
      await submitButton.click({ force: true, delay: 100 });
    } catch (e) {
      console.log("Force click failed, falling back to JS click...");
      await submitButton.evaluate((el) => el.click());
    }

    console.log("Submit button clicked");

    // 4. Monitor for the visual puzzle frame (appears if token was insufficient)
    const challengeIframe = this.page.locator(
      'iframe[src*="hcaptcha.com"][src*="frame=challenge"], iframe[title*="challenge"]'
    );

    let isPuzzleVisible = await challengeIframe
      .isVisible({ timeout: 4000 })
      .catch(() => false);

    if (isPuzzleVisible) {
      console.log("\n=======================================================");
      console.log("⚠️  CAPTCHA PUZZLE DETECTED!");
      console.log("   Automation PAUSED. Please solve the captcha in the browser.");
      console.log("=======================================================\n");

      const startTime = Date.now();
      const maxWaitTime = 120000; // 2 minutes max wait

      while (isPuzzleVisible && (Date.now() - startTime) < maxWaitTime) {
        await this.page.waitForTimeout(1000);
        isPuzzleVisible = await challengeIframe.isVisible().catch(() => false);
        if (this.page.url().includes("/thanks")) break;
      }

      console.log("🔄 Captcha solved. Resuming automation...");
      await this.page.waitForTimeout(1500);
    }

    // 5. Unregister network logger
    this.page.off("response", capturePostResponse);

    // 6. Wait for redirect to /thanks
    try {
      await this.page.waitForURL((url) => url.pathname.includes("/thanks"), { timeout: 15000 });
    } catch (e) {}

    await this.page.waitForLoadState("domcontentloaded").catch(() => {});

    // 7. Check for 400 Bad Request
    if (postResponse && postResponse.status() >= 400) {
      const errorLocator = this.page.locator('.application-error, .error-message, .submit-error');
      let errorMessage = "Unknown validation error";

      if (await errorLocator.count() > 0) {
        errorMessage = await errorLocator.first().innerText();
      } else {
        const bodyText = await this.page.locator("body").innerText().catch(() => "");
        if (bodyText.includes("Please complete the CAPTCHA")) errorMessage = "CAPTCHA validation failed";
        else if (bodyText.includes("resume")) errorMessage = "Resume upload failed or was missing";
      }

      console.error(`❌ Lever Validation Error: ${errorMessage.trim()}`);
      throw new Error(`Lever rejected application (400). Reason: ${errorMessage.trim()}`);
    }

    const currentUrl = this.page.url();
    const confirmationText = await this.page.locator("body").innerText().catch(() => "");

    if (
      currentUrl.includes("/thanks") ||
      confirmationText.includes("Thank you for applying") ||
      confirmationText.includes("Application submitted") ||
      confirmationText.includes("Success!")
    ) {
      console.log("✅ Application submitted successfully!");
      return {
        receipt,
        confirmationText: "Application submitted successfully",
      };
    }

    if (confirmationText.includes("There was an error verifying your application")) {
      throw new Error("Lever application verification failed. Form validation or captcha rejected.");
    }

    return { receipt, confirmationText };
  }
}

// import { BaseAdapter } from "./baseAdapter.js";

// export class LeverAdapter extends BaseAdapter {
// async openApplication(jobUrl) {
//   const applicationUrl = jobUrl.endsWith("/apply")
//     ? jobUrl
//     : `${jobUrl.replace(/\/$/, "")}/apply`;

//   console.log("Opening Lever application:", applicationUrl);

//   await this.page.goto(applicationUrl, {
//     waitUntil: "domcontentloaded",
//     timeout: 30000,
//   });

//   await this.page.waitForLoadState("networkidle");

//   console.log("✅ Lever application opened");
//   console.log("URL:", this.page.url());
//   console.log("Title:", await this.page.title());
// }

// async getFields() {
//   const fields = await this.page.locator(
//     "input:not([type='hidden']), textarea, select"
//   ).evaluateAll((elements) => {
//     const result = [];
//     const seen = new Set();

//     for (const element of elements) {
//       // Ignore Lever's internal custom-pronoun controls
//       if (
//         element.id === "customPronounsOption" ||
//         element.id === "customPronounsTextField"
//       ) {
//         continue;
//       }

//       const name = element.getAttribute("name");
//       const type =
//         element.getAttribute("type") || element.tagName.toLowerCase();

//       // Radio/checkbox fields represent one logical question
//       const isGrouped = type === "radio" || type === "checkbox";

//       const key = isGrouped
//         ? `${type}:${name}`
//         : `${type}:${name || element.id || result.length}`;

//       if (seen.has(key)) {
//         continue;
//       }

//       seen.add(key);

//       let label = null;

//       // --------------------------------------------------
// // 1. Select fields
// // --------------------------------------------------
// let options = [];

// if (type === "select") {
//   const container = element.closest(
//     ".application-question, .question, .field"
//   );

//   if (container) {
//     const labelElement = container.querySelector("label");

//     if (labelElement) {
//       label = labelElement.innerText.trim();
//     }
//   }

//   // Fallback: label associated through "for"
//   if (!label && element.id) {
//     const labelElement = document.querySelector(
//       `label[for="${CSS.escape(element.id)}"]`
//     );

//     if (labelElement) {
//       label = labelElement.innerText.trim();
//     }
//   }

//   // Extract dropdown options
//   options = Array.from(element.options)
//     .map((option) => ({
//       value: option.value,
//       label: option.textContent.trim(),
//     }))
//     .filter((option) => option.label);
// }

//       // --------------------------------------------------
//       // 2. Radio / checkbox fields
//       // --------------------------------------------------
//       if (isGrouped && name) {
//         const group = Array.from(
//           document.querySelectorAll(
//             `input[type="${type}"][name="${CSS.escape(name)}"]`
//           )
//         );

//         // Get the parent/question container
//         const container = element.closest(
//           ".application-question, .question, .field"
//         );

//         if (container) {
//           const labelElements = Array.from(
//             container.querySelectorAll("label")
//           );

//           // Find a label that is NOT one of the option labels.
//           // Lever's question heading is generally the first relevant
//           // label before the actual radio/checkbox options.
//           if (labelElements.length > group.length) {
//             label = labelElements[0].innerText.trim();
//           }
//         }

//         // If that didn't work, look for a heading/legend
//         if (!label && container) {
//           const heading = container.querySelector(
//             "legend, h1, h2, h3, h4, h5, h6"
//           );

//           if (heading) {
//             label = heading.innerText.trim();
//           }
//         }

//         // Final fallback: use the first option label
//         if (!label && group.length > 0) {
//           const firstInput = group[0];

//           if (firstInput.id) {
//             const optionLabel = document.querySelector(
//               `label[for="${CSS.escape(firstInput.id)}"]`
//             );

//             if (optionLabel) {
//               label = optionLabel.innerText.trim();
//             }
//           }

//           if (!label) {
//             label = firstInput.value;
//           }
//         }

//         // Extract all options
//         const options = group.map((input) => {
//           let optionLabel = input.value;

//           if (input.id) {
//             const optionLabelElement = document.querySelector(
//               `label[for="${CSS.escape(input.id)}"]`
//             );

//             if (optionLabelElement) {
//               optionLabel = optionLabelElement.innerText.trim();
//             }
//           }

//           return {
//             value: input.value,
//             label: optionLabel,
//           };
//         });

//         result.push({
//           id: element.id || null,
//           name,
//           label,
//           type,
//           required: group.some((input) => input.required),
//           placeholder: element.getAttribute("placeholder"),
//           ariaLabel: element.getAttribute("aria-label"),
//           options,
//         });

//         continue;
//       }

//       // --------------------------------------------------
//       // 3. Normal inputs / textarea
//       // --------------------------------------------------

//       // Find label associated through "for"
//       if (element.id) {
//         const labelElement = document.querySelector(
//           `label[for="${CSS.escape(element.id)}"]`
//         );

//         if (labelElement) {
//           label = labelElement.innerText.trim();
//         }
//       }

//       // Look for surrounding question container
//       if (!label) {
//         const container = element.closest(
//           ".application-question, .question, .field"
//         );

//         if (container) {
//           const labelElement = container.querySelector("label");

//           if (labelElement) {
//             label = labelElement.innerText.trim();
//           }
//         }
//       }

//       // Fallback to name
//       if (!label && name) {
//         label = name;
//       }

//       result.push({
//         id: element.id || null,
//         name,
//         label,
//         type,
//         required: element.required,
//         placeholder: element.getAttribute("placeholder"),
//         ariaLabel: element.getAttribute("aria-label"),
//         options,
//       });
//     }

//     return result;
//   });

//   return fields;
// }

//     async fillField(field, value) {
//     if (value === undefined || value === null) {
//       throw new Error(`No value provided for field: ${field.name}`);
//     }

//     console.log(`Filling ${field.name} → ${value}`);

//     let locator;
//     if (field.id) {
//       locator = this.page.locator(`#${field.id}`);
//     } else if (field.name) {
//       locator = this.page.locator(`[name="${field.name}"]`);
//     } else {
//       throw new Error(`Cannot locate field: ${field.name}`);
//     }

//     // --------------------------------------------------
//     // 1. SELECT / DROPDOWN
//     // --------------------------------------------------
//     if (field.type === "select") {
//       try {
//         await locator.selectOption({ value: String(value) });
//       } catch (error) {
//         await locator.selectOption({ label: String(value) });
//       }
//       return;
//     }

//     // --------------------------------------------------
//     // 2. RADIO BUTTONS
//     // --------------------------------------------------
//     if (field.type === "radio") {
//       const radio = this.page.locator(
//         `[name="${field.name}"][value="${String(value)}"]`
//       );

//       if ((await radio.count()) > 0) {
//         const id = await radio.getAttribute("id");
//         let clicked = false;

//         // Lever radio labels
//         if (id) {
//           const label = this.page.locator(`label[for="${id}"]`);
//           if ((await label.count()) > 0 && (await label.isVisible())) {
//             await label.click();
//             clicked = true;
//           }
//         }

//         if (!clicked) {
//           await radio.check({ force: true }).catch(async () => {
//             await radio.evaluate((el) => {
//               el.checked = true;
//               el.dispatchEvent(new Event("change", { bubbles: true }));
//             });
//           });
//         }
//       }
//       return;
//     }

//     // --------------------------------------------------
//     // 3. CHECKBOXES
//     // --------------------------------------------------
//     if (field.type === "checkbox") {
//       const values = Array.isArray(value) ? value : [value];

//       for (const option of values) {
//         const checkbox = this.page.locator(
//           `[name="${field.name}"][value="${String(option)}"]`
//         );

//         if ((await checkbox.count()) === 0) continue;

//         const isChecked = await checkbox.isChecked().catch(() => false);
//         if (isChecked) continue;

//         const id = await checkbox.getAttribute("id");
//         let clicked = false;

//         // Try clicking Lever's label wrapper
//         if (id) {
//           const label = this.page.locator(`label[for="${id}"]`);
//           if ((await label.count()) > 0 && (await label.isVisible())) {
//             await label.click();
//             clicked = true;
//           }
//         }

//         // Fallback: Click parent element
//         if (!clicked) {
//           const parent = checkbox.locator("xpath=..");
//           if ((await parent.count()) > 0) {
//             await parent.click().catch(() => {});
//           }
//         }

//         // Final safety check: set checked state via DOM if still unchecked
//         const stillUnchecked = !(await checkbox.isChecked().catch(() => false));
//         if (stillUnchecked) {
//           await checkbox.evaluate((el) => {
//             el.checked = true;
//             el.dispatchEvent(new Event("input", { bubbles: true }));
//             el.dispatchEvent(new Event("change", { bubbles: true }));
//           }).catch(() => {});
//         }
//       }
//       return;
//     }

//     // --------------------------------------------------
//     // 4. TEXT / TEXTAREA / DATE / PHONE
//     // --------------------------------------------------
//     await locator.fill(String(value));
//   }

  
//   async submit() {
//     console.log("Submitting Lever application...");

//     const receipt = {};

//     // Collect all inputs for the receipt
//     const inputs = this.page.locator(
//       "input[name], textarea[name], select[name]"
//     );
//     const count = await inputs.count();

//     for (let i = 0; i < count; i++) {
//       const input = inputs.nth(i);
//       const name = await input.getAttribute("name");
//       if (!name) continue;

//       const tagName = await input.evaluate((element) =>
//         element.tagName.toLowerCase()
//       );
//       const type = await input.getAttribute("type");

//       if (type === "file") {
//         receipt[name] = "[resume uploaded]";
//         continue;
//       }

//       if (type === "radio" || type === "checkbox") {
//         const checked = await input.isChecked().catch(() => false);
//         if (!checked) continue;

//         const value = await input.getAttribute("value");
//         if (receipt[name] === undefined) {
//           receipt[name] = value ?? true;
//         } else if (Array.isArray(receipt[name])) {
//           receipt[name].push(value ?? true);
//         } else {
//           receipt[name] = [receipt[name], value ?? true];
//         }
//         continue;
//       }

//       if (tagName === "select") {
//         receipt[name] = await input.inputValue();
//         continue;
//       }

//       receipt[name] = await input.inputValue();
//     }

//     console.log("Receipt collected:");
//     console.log(JSON.stringify(receipt, null, 2));

//     const submitButton = this.page.locator("#btn-submit");
//     await submitButton.waitFor({ state: "visible", timeout: 10000 });
//     await submitButton.scrollIntoViewIfNeeded();

//     console.log("Submit button found");

//     // Human-like pause before clicking
//     await this.page.waitForTimeout(1000);

//     // Click submit and wait for the POST response
//     const [response] = await Promise.all([
//       this.page.waitForResponse(
//         (res) =>
//           res.url().includes("/apply") &&
//           res.request().method() === "POST",
//         { timeout: 30000 }
//       ).catch(() => null),
//       submitButton.click(),
//     ]);

//     console.log("Submit button clicked");

//     if (response) {
//       console.log(`SUBMIT RESPONSE STATUS: ${response.status()}`);
//       if (response.status() >= 400) {
//         const text = await response.text().catch(() => "");
//         console.error("Response error preview:", text.slice(0, 500));
//         throw new Error(
//           `Lever rejected application with HTTP ${response.status()}. Manual captcha or field correction required.`
//         );
//       }
//     }

//     // Wait for redirect to /thanks or confirmation screen
//     await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
//     await this.page.waitForTimeout(2000);

//     const confirmationText = (
//       await this.page.locator("body").innerText()
//     ).trim();

//     if (
//       confirmationText.includes("There was an error verifying your application")
//     ) {
//       throw new Error(
//         "Lever application verification failed. Manual hCaptcha verification may be required."
//       );
//     }

//     console.log("Application submitted successfully!");

//     return {
//       receipt,
//       confirmationText,
//     };
//   }

// async uploadResume(filePath) {
//   if (!filePath) {
//     throw new Error("Resume file path is required");
//   }

//   const resumeInput = this.page.locator("#resume-upload-input");

//   await resumeInput.setInputFiles(filePath);

//   console.log(`✅ Resume uploaded: ${filePath}`);
// }

//   // async submit() {
//   //   console.log("Submitting Lever application...");

//   //   const receipt = {};

//   //   // Collect filled state before submit
//   //   const inputs = this.page.locator("input[name], textarea[name], select[name]");
//   //   const count = await inputs.count();

//   //   for (let i = 0; i < count; i++) {
//   //     const input = inputs.nth(i);
//   //     const name = await input.getAttribute("name");
//   //     if (!name) continue;

//   //     const tagName = await input.evaluate((element) =>
//   //       element.tagName.toLowerCase()
//   //     );
//   //     const type = await input.getAttribute("type");

//   //     if (type === "file") {
//   //       receipt[name] = "[resume uploaded]";
//   //       continue;
//   //     }

//   //     if (type === "radio" || type === "checkbox") {
//   //       const checked = await input.isChecked().catch(() => false);
//   //       if (!checked) continue;

//   //       const value = await input.getAttribute("value");
//   //       if (receipt[name] === undefined) {
//   //         receipt[name] = value ?? true;
//   //       } else if (Array.isArray(receipt[name])) {
//   //         receipt[name].push(value ?? true);
//   //       } else {
//   //         receipt[name] = [receipt[name], value ?? true];
//   //       }
//   //       continue;
//   //     }

//   //     if (tagName === "select") {
//   //       receipt[name] = await input.inputValue();
//   //       continue;
//   //     }

//   //     receipt[name] = await input.inputValue();
//   //   }

//   //   console.log("Receipt collected:");
//   //   console.log(JSON.stringify(receipt, null, 2));

//   //   const submitButton = this.page.locator("#btn-submit");
//   //   await submitButton.waitFor({ state: "visible", timeout: 10000 });
//   //   await submitButton.scrollIntoViewIfNeeded();

//   //   console.log("Submit button found");

//   //   // Setup listener for the submit POST response
//   //   const submitResponsePromise = this.page.waitForResponse(
//   //     (response) =>
//   //       response.url().includes("/apply") &&
//   //       response.request().method() === "POST",
//   //     { timeout: 25000 }
//   //   ).catch(() => null);

//   //   // Human-like delay and click
//   //   await this.page.waitForTimeout(500);
//   //   await submitButton.click({ delay: 50 });
//   //   console.log("Submit button clicked");

//   //   // Check if an interactive hCaptcha challenge iframe popped up
//   //   const captchaFrame = this.page.locator(
//   //     'iframe[src*="hcaptcha.com"][src*="frame=challenge"]'
//   //   );

//   //   const isCaptchaModalVisible = await captchaFrame
//   //     .isVisible({ timeout: 2500 })
//   //     .catch(() => false);

//   //   if (isCaptchaModalVisible) {
//   //     console.log(
//   //       "⚠️ Interactive hCaptcha challenge appeared. Waiting for resolution (up to 45s)..."
//   //     );
//   //     // Wait for challenge frame to close after user solves it manually in the open browser
//   //     await captchaFrame
//   //       .waitFor({ state: "hidden", timeout: 45000 })
//   //       .catch(() => {});
//   //   }

//   //   const response = await submitResponsePromise;

//   //   if (response) {
//   //     console.log(`SUBMIT RESPONSE STATUS: ${response.status()}`);
//   //     if (response.status() === 400) {
//   //       const body = await response.text().catch(() => "");
//   //       console.error("400 Response Body:", body);
//   //       throw new Error(
//   //         "Lever application verification failed. hCaptcha rejected the request."
//   //       );
//   //     }
//   //   }

//   //   // Wait for redirect to /thanks or confirmation text
//   //   await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
//   //   await this.page.waitForTimeout(1500);

//   //   const confirmationText = (
//   //     await this.page.locator("body").innerText()
//   //   ).trim();

//   //   if (
//   //     confirmationText.includes("There was an error verifying your application")
//   //   ) {
//   //     throw new Error(
//   //       "Lever application verification failed. Manual hCaptcha verification may be required."
//   //     );
//   //   }

//   //   console.log("Application submitted successfully");

//   //   return {
//   //     receipt,
//   //     confirmationText,
//   //   };
//   // }
// }