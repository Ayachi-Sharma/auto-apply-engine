import { BaseAdapter } from "./baseAdapter.js";

/**
 * CSS.escape() is a browser global — not available in Node.js.
 * This is a minimal implementation for building attribute/ID selectors.
 */
function cssEscape(str) {
  if (str === undefined) return "";
  return String(str).replace(/([\0-\x1f\x7f]|^-?\d|^-$|[^\x80-\uFFFF\w-])/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code === 0) return "\uFFFD";
    if (code <= 0x1f || code === 0x7f) return `\\${code.toString(16)} `;
    return `\\${ch}`;
  });
}

export class AshbyAdapter extends BaseAdapter {
  // ── Open ──────────────────────────────────────────────────────────────────

  async openApplication(jobUrl) {
    // Ashby job listing:   https://jobs.ashbyhq.com/{company}/{job-id}
    // Ashby apply form:    https://jobs.ashbyhq.com/{company}/{job-id}/application
    let cleanUrl;
    try {
      const parsed = new URL(jobUrl);
      cleanUrl = parsed.origin + parsed.pathname.replace(/\/$/, "");
    } catch {
      cleanUrl = jobUrl.split("?")[0].split("#")[0].replace(/\/$/, "");
    }

    const applicationUrl = cleanUrl.endsWith("/application")
      ? cleanUrl
      : `${cleanUrl}/application`;

    console.log("Opening Ashby application:", applicationUrl);

    await this.page.goto(applicationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await this.page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {
      console.warn("⚠️ networkidle timed out — continuing anyway.");
    });

    console.log("URL after navigation:", this.page.url());
    console.log("Title:", await this.page.title());

    // If we landed on the job description page instead, click Apply
    const currentUrl = this.page.url();
    const isOnApplicationPage =
      currentUrl.includes("/application") || currentUrl.includes("/apply");

    if (!isOnApplicationPage) {
      console.log("Not on application page — looking for Apply button...");
      const APPLY_SELECTORS = [
        "a:has-text('Apply')",
        "button:has-text('Apply')",
        "a:has-text('Apply for this job')",
        "a[href*='/application']",
        "[data-testid*='apply']",
      ];
      for (const sel of APPLY_SELECTORS) {
        try {
          const btn = this.page.locator(sel).first();
          if ((await btn.count()) > 0 && (await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
            console.log(`Clicking Apply button: ${sel}`);
            await btn.click();
            await this.page.waitForLoadState("domcontentloaded", { timeout: 15000 });
            await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
            break;
          }
        } catch {
          // try next
        }
      }
    }

    // Wait for the form to render (React SPA)
    const formReady = await this.page
      .waitForFunction(
        () => {
          const inputs = document.querySelectorAll(
            "input:not([type='hidden']), textarea, input[type='file']"
          );
          return inputs.length > 0;
        },
        { timeout: 30000 }
      )
      .catch(() => null);

    if (!formReady) {
      const pageText = await this.page.locator("body").innerText().catch(() => "");
      console.warn("⚠️ Form did not render. Page text sample:", pageText.slice(0, 500));
      console.warn("Current URL:", this.page.url());
    } else {
      console.log("✅ Ashby application form loaded");
    }

    console.log("Final URL:", this.page.url());
    console.log("Final Title:", await this.page.title());
  }

  // ── Extract fields ────────────────────────────────────────────────────────

  async getFields() {
    await this.page.waitForTimeout(1000);

    const fields = await this.page
      .locator("input:not([type='hidden']), textarea, select")
      .evaluateAll((elements) => {
        const result = [];
        const seen = new Set();

        function extractLabel(el) {
          // 1. label[for=id]
          if (el.id) {
            const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (lbl) return lbl.innerText.trim();
          }
          // 2. aria-labelledby
          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const lbl = document.getElementById(labelledBy);
            if (lbl) return lbl.innerText.trim();
          }
          // 3. aria-label
          const ariaLabel = el.getAttribute("aria-label");
          if (ariaLabel) return ariaLabel.trim();

          // 4. Walk up ancestors
          let node = el.parentElement;
          for (let d = 0; d < 8 && node; d++) {
            const lbl = node.querySelector("label");
            if (lbl && !lbl.contains(el)) {
              const txt = lbl.innerText.trim();
              if (txt) return txt;
            }
            const textCandidates = Array.from(
              node.querySelectorAll("span, div, p, legend, h1, h2, h3, h4")
            ).filter(
              (n) =>
                !n.contains(el) &&
                n.children.length === 0 &&
                n.innerText.trim().length > 1 &&
                n.innerText.trim().length < 200
            );
            if (textCandidates.length > 0) return textCandidates[0].innerText.trim();
            node = node.parentElement;
          }

          // 5. placeholder
          const placeholder = el.getAttribute("placeholder");
          if (placeholder && !/^(enter|type)/i.test(placeholder)) return placeholder.trim();

          return null;
        }

        for (const element of elements) {
          const name =
            element.getAttribute("name") ||
            element.id ||
            element.getAttribute("data-testid") ||
            null;

          const rawType =
            element.getAttribute("type") || element.tagName.toLowerCase();
          const type = rawType === "textarea" ? "textarea" : rawType;

          const isGrouped = type === "radio" || type === "checkbox";
          const dedupeKey = isGrouped
            ? `${type}:${name}`
            : `${type}:${name || element.id || result.length}`;

          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          if (type === "file") continue;

          const label = extractLabel(element);
          let options = [];

          if (type === "select") {
            options = Array.from(element.options)
              .map((o) => ({ value: o.value, label: o.textContent.trim() }))
              .filter((o) => o.label);
          }

          if (isGrouped && name) {
            const group = Array.from(
              document.querySelectorAll(
                `input[type="${type}"][name="${CSS.escape(name)}"]`
              )
            );
            options = group.map((inp) => {
              let optLabel = inp.value;
              if (inp.id) {
                const lbl = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`);
                if (lbl) optLabel = lbl.innerText.trim();
              }
              if (!optLabel || optLabel === inp.value) {
                const parentLabel = inp.closest("label");
                if (parentLabel) optLabel = parentLabel.innerText.trim();
              }
              return { value: inp.value, label: optLabel };
            });
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
          });
        }

        return result;
      });

    // Phase 2: rescue labels for fields that still have no label
    for (const field of fields) {
      if (!field.label && field.name) {
        const rescued = await this.page.evaluate((fieldName) => {
          const el =
            document.querySelector(`[name="${fieldName}"]`) ||
            document.querySelector(`#${fieldName}`);
          if (!el) return null;

          let node = el.parentElement;
          for (let d = 0; d < 8 && node; d++) {
            const leafTextEls = Array.from(
              node.querySelectorAll("label, span, div, p, legend, h1, h2, h3, h4")
            ).filter(
              (n) =>
                !n.contains(el) &&
                n.children.length === 0 &&
                n.innerText?.trim().length > 1 &&
                n.innerText?.trim().length < 200
            );
            for (const t of leafTextEls) {
              const txt = t.innerText?.trim();
              if (txt) return txt;
            }
            node = node.parentElement;
          }
          return null;
        }, field.name).catch(() => null);

        if (rescued) {
          console.log(`[ASHBY LABEL RESCUE] ${field.name} → "${rescued}"`);
          field.label = rescued;
        }
      }
    }

    console.log(
      `[Ashby] Extracted ${fields.length} fields:`,
      fields.map((f) => `${f.name} (${f.type})`).join(", ")
    );

    return fields;
  }

  // ── Fill a single field ───────────────────────────────────────────────────

  async fillField(field, value) {
    if (value === undefined || value === null) {
      console.warn(`[Ashby] Skipping field with no value: ${field.label || field.name}`);
      return;
    }

    const fieldLabel = field.label || field.name || "(unknown)";
    console.log(`[Ashby] Filling "${fieldLabel}" → ${JSON.stringify(value)}`);

    // ── Build locator: try 6 strategies in priority order ─────────────────
    let locator = null;

    // 1. getByLabel (exact)
    if (field.label) {
      const byLabel = this.page.getByLabel(field.label, { exact: true });
      if ((await byLabel.count()) > 0) locator = byLabel.first();
    }
    // 1b. getByLabel (fuzzy)
    if (!locator && field.label) {
      const byLabelFuzzy = this.page.getByLabel(field.label, { exact: false });
      if ((await byLabelFuzzy.count()) > 0) locator = byLabelFuzzy.first();
    }
    // 2. [id="..."]
    if (!locator && field.id) {
      const byId = this.page.locator(`[id="${field.id.replace(/"/g, '\\"')}"]`);
      if ((await byId.count()) > 0) locator = byId.first();
    }
    // 3. [name="..."]
    if (!locator && field.name) {
      const byName = this.page.locator(`[name="${field.name.replace(/"/g, '\\"')}"]`);
      if ((await byName.count()) > 0) locator = byName.first();
    }
    // 4. aria-label
    if (!locator && field.ariaLabel) {
      const byAriaLabel = this.page.getByLabel(field.ariaLabel, { exact: false });
      if ((await byAriaLabel.count()) > 0) locator = byAriaLabel.first();
    }
    // 5. placeholder
    if (!locator && field.label) {
      const byPlaceholder = this.page.getByPlaceholder(field.label, { exact: false });
      if ((await byPlaceholder.count()) > 0) locator = byPlaceholder.first();
    }
    // 6. Container text search — walk DOM to find input inside a container mentioning the label
    if (!locator && field.label) {
      const found = await this.page.evaluate((labelText) => {
        const allInputs = Array.from(
          document.querySelectorAll("input:not([type='hidden']):not([type='file']), textarea")
        );
        for (const inp of allInputs) {
          let node = inp.parentElement;
          for (let d = 0; d < 8 && node; d++) {
            const nodeText = node.innerText?.toLowerCase() ?? "";
            if (nodeText.includes(labelText.toLowerCase())) {
              if (inp.id) return { id: inp.id };
              if (inp.name) return { name: inp.name };
              if (inp.placeholder) return { placeholder: inp.placeholder };
              return { index: allInputs.indexOf(inp) };
            }
            node = node.parentElement;
          }
        }
        return null;
      }, field.label);

      if (found) {
        if (found.id) locator = this.page.locator(`[id="${found.id}"]`);
        else if (found.name) locator = this.page.locator(`[name="${found.name}"]`);
        else if (found.placeholder) locator = this.page.getByPlaceholder(found.placeholder, { exact: false });
        else locator = this.page.locator("input:not([type='hidden']):not([type='file']), textarea").nth(found.index);
        if (locator) console.log(`[Ashby] Located "${fieldLabel}" via container text search`);
      }
    }

    // If still no locator — warn and skip (don't crash the whole run)
    if (!locator) {
      console.warn(`⚠️ [Ashby] Could not locate field "${fieldLabel}" — skipping.`);
      return;
    }

    // ── SELECT ───────────────────────────────────────────────────────────────
    if (field.type === "select") {
      try {
        await locator.selectOption({ value: String(value) });
      } catch {
        const options = await locator.locator("option").allInnerTexts();
        const matched = options.find(
          (opt) => opt.trim().toLowerCase() === String(value).trim().toLowerCase()
        );
        if (matched) await locator.selectOption({ label: matched.trim() });
        else console.warn(`⚠️ [Ashby] Option "${value}" not found in select "${fieldLabel}"`);
      }
      return;
    }

    // ── RADIO ────────────────────────────────────────────────────────────────
    if (field.type === "radio") {
      const radios = field.name
        ? this.page.locator(`[name="${field.name}"]`)
        : locator;
      const count = await radios.count();
      let matched = null;

      for (let i = 0; i < count; i++) {
        const r = radios.nth(i);
        const val = await r.getAttribute("value");
        if (val?.toLowerCase() === String(value).toLowerCase()) {
          matched = r;
          break;
        }
      }

      if (matched) {
        const id = await matched.getAttribute("id");
        if (id) {
          const lbl = this.page.locator(`label[for="${id}"]`);
          if ((await lbl.count()) > 0 && (await lbl.isVisible())) {
            await lbl.click();
            return;
          }
        }
        await matched.check({ force: true }).catch(async () => {
          await matched.evaluate((el) => {
            el.checked = true;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });
      } else {
        console.warn(`⚠️ [Ashby] Radio option "${value}" not found for "${fieldLabel}"`);
      }
      return;
    }

    // ── CHECKBOX ─────────────────────────────────────────────────────────────
    if (field.type === "checkbox") {
      const values = Array.isArray(value) ? value : [String(value)];
      const checkboxes = field.name
        ? this.page.locator(`[name="${field.name}"]`)
        : locator;
      const count = await checkboxes.count();

      for (const targetVal of values) {
        for (let i = 0; i < count; i++) {
          const cb = checkboxes.nth(i);
          const val = await cb.getAttribute("value");
          if (val?.toLowerCase() === targetVal.toLowerCase()) {
            const isChecked = await cb.isChecked().catch(() => false);
            if (!isChecked) {
              await cb.check({ force: true }).catch(async () => {
                await cb.evaluate((el) => {
                  el.checked = true;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                });
              });
            }
            break;
          }
        }
      }
      return;
    }

    // ── LOCATION / TYPEAHEAD ─────────────────────────────────────────────────
    // Ashby's Location field is a custom autocomplete — type → wait → click suggestion
    const isLocationField =
      /location|city|address/i.test(field.label || "") ||
      /location|city|address/i.test(field.placeholder || "") ||
      /location|city|address/i.test(field.ariaLabel || "");

    if (isLocationField) {
      await locator.click().catch(() => {});
      await this.page.waitForTimeout(300);
      await locator.fill(String(value));
      await this.page.waitForTimeout(1200);

      const SUGGESTION_SELECTORS = [
        "[role='option']",
        "[role='listbox'] [role='option']",
        "[class*='suggestion']",
        "[class*='autocomplete'] li",
        "[class*='dropdown'] li",
        "ul[role='listbox'] li",
      ];

      let clicked = false;
      for (const sel of SUGGESTION_SELECTORS) {
        const suggestion = this.page.locator(sel).first();
        if ((await suggestion.count()) > 0 && (await suggestion.isVisible().catch(() => false))) {
          await suggestion.click().catch(() => {});
          clicked = true;
          console.log(`[Ashby] Location suggestion clicked: ${sel}`);
          break;
        }
      }

      if (!clicked) {
        await locator.press("Enter").catch(() => {});
        console.warn("⚠️ [Ashby] No location suggestion found — used typed value as-is");
      }
      return;
    }

    // ── TEXT / TEXTAREA ──────────────────────────────────────────────────────
    await locator.click().catch(() => {});
    await locator.fill(String(value));
    await locator.dispatchEvent("input");
    await locator.dispatchEvent("change");
  }

  // ── Resume upload ─────────────────────────────────────────────────────────

  async uploadResume(filePath) {
    if (!filePath) throw new Error("Resume file path is required");

    await this.page.waitForTimeout(2000);

    const fileInputDump = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll("input[type='file']")).map((el) => ({
        name: el.name,
        id: el.id,
        accept: el.accept,
        visible: el.offsetParent !== null,
        style: el.getAttribute("style"),
        parentHTML: el.parentElement?.outerHTML?.slice(0, 200),
      }));
    });
    console.log(`[Ashby] File inputs found on page: ${JSON.stringify(fileInputDump, null, 2)}`);

    // Try clicking the upload dropzone/button first
    const DROPZONE_SELECTORS = [
      "[data-testid*='resume']",
      "[data-testid*='upload']",
      "[aria-label*='resume' i]",
      "[aria-label*='upload' i]",
      "button:has-text('Upload')",
      "button:has-text('Resume')",
      "button:has-text('CV')",
      "div[role='button']:has-text('Upload')",
      "label:has-text('Upload')",
      "label:has-text('Resume')",
      "[class*='upload']",
      "[class*='dropzone']",
      "[class*='resume']",
    ];

    for (const sel of DROPZONE_SELECTORS) {
      try {
        const zone = this.page.locator(sel).first();
        if ((await zone.count()) > 0 && (await zone.isVisible().catch(() => false))) {
          console.log(`[Ashby] Clicking upload zone: ${sel}`);
          await zone.click({ force: true }).catch(() => {});
          await this.page.waitForTimeout(500);
          break;
        }
      } catch {
        // continue
      }
    }

    // Find the file input (hidden or visible)
    const FILE_SELECTORS = [
      "input[type='file'][name*='resume' i]",
      "input[type='file'][accept*='pdf']",
      "input[type='file'][accept*='.pdf']",
      "input[type='file'][accept*='doc']",
      "input[type='file']",
    ];

    let resumeInput = null;
    for (const selector of FILE_SELECTORS) {
      const candidate = this.page.locator(selector).first();
      try {
        await candidate.waitFor({ state: "attached", timeout: 5000 });
        resumeInput = candidate;
        console.log(`📎 [Ashby] File input found: ${selector}`);
        break;
      } catch {
        // try next
      }
    }

    // Fallback: JS DataTransfer injection
    if (!resumeInput) {
      console.warn("[Ashby] No file input found — trying JS DataTransfer injection...");

      const fs = await import("fs");
      const path = await import("path");

      try {
        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");
        const mimeType = filePath.endsWith(".pdf") ? "application/pdf" : "application/octet-stream";
        const fileName = path.basename(filePath);

        const injected = await this.page.evaluate(
          async ({ base64Data, mimeType, fileName }) => {
            const byteChars = atob(base64Data);
            const byteNums = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) {
              byteNums[i] = byteChars.charCodeAt(i);
            }
            const blob = new Blob([byteNums], { type: mimeType });
            const file = new File([blob], fileName, { type: mimeType });
            const input = document.querySelector("input[type='file']");
            if (!input) return false;
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          },
          { base64Data: base64, mimeType, fileName }
        );

        if (injected) {
          console.log("✅ [Ashby] Resume injected via JS DataTransfer");
          await this.page.waitForTimeout(2000);
          return;
        }
      } catch (err) {
        console.error("[Ashby] JS DataTransfer injection failed:", err.message);
      }

      throw new Error(
        "[Ashby] Resume upload failed: could not find file input. " +
        "The form may use a non-standard upload mechanism."
      );
    }

    await resumeInput.setInputFiles(filePath);

    await this.page
      .waitForFunction(
        () => {
          const body = document.body.innerText;
          return (
            body.includes(".pdf") ||
            body.includes(".doc") ||
            document.querySelector("[class*='upload-success'], [class*='file-name'], [data-testid*='file']") !== null
          );
        },
        { timeout: 10000 }
      )
      .catch(() => {
        console.warn("⚠️ [Ashby] Could not confirm upload completion — continuing anyway.");
      });

    console.log(`✅ [Ashby] Resume uploaded: ${filePath}`);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async submit() {
    console.log("[Ashby] Submitting application...");

    const receipt = await this.page.evaluate(() => {
      const data = {};
      const inputs = document.querySelectorAll("input:not([type='hidden']):not([type='file']), textarea, select");
      for (const inp of inputs) {
        const key =
          inp.getAttribute("aria-label") ||
          inp.getAttribute("name") ||
          inp.id ||
          null;
        if (!key) continue;
        const type = inp.getAttribute("type");
        if (type === "radio" || type === "checkbox") {
          if (inp.checked) data[key] = inp.value ?? true;
        } else {
          data[key] = inp.value;
        }
      }
      return data;
    });

    console.log("Receipt collected:", JSON.stringify(receipt, null, 2));

    const SUBMIT_SELECTORS = [
      "button[type='submit']",
      "button:has-text('Submit Application')",
      "button:has-text('Submit')",
      "button:has-text('Apply')",
      "[data-testid='submit-application-button']",
    ];

    let submitBtn = null;
    for (const sel of SUBMIT_SELECTORS) {
      const btn = this.page.locator(sel).first();
      if ((await btn.count()) > 0) {
        submitBtn = btn;
        break;
      }
    }

    if (!submitBtn) {
      throw new Error("[Ashby] Submit button not found");
    }

    await submitBtn.waitFor({ state: "visible", timeout: 10000 });
    console.log("[Ashby] Submit button found");

    const captchaReady = await this.page.waitForFunction(
      () => {
        if (window.grecaptcha && typeof window.grecaptcha.execute === "function") return true;
        return !document.querySelector('[src*="recaptcha"]');
      },
      { timeout: 10000 }
    ).catch(() => null);

    if (!captchaReady) {
      console.warn("⚠️ [Ashby] reCAPTCHA not detected as ready — submitting anyway.");
    } else {
      console.log("✅ [Ashby] reCAPTCHA ready.");
    }

    let postResponse = null;
    const captureResponse = async (res) => {
      if (
        (res.url().includes("/api/") || res.url().includes("/apply")) &&
        res.request().method() === "POST"
      ) {
        postResponse = res;
        console.log(`[Ashby Network] POST response: ${res.status()} ${res.url()}`);
      }
    };
    this.page.on("response", captureResponse);

    await submitBtn.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(200);
    try {
      await submitBtn.click({ force: true, delay: 100 });
    } catch {
      await submitBtn.evaluate((el) => el.click());
    }

    console.log("[Ashby] Submit button clicked");
    this.page.off("response", captureResponse);

    await this.page
      .waitForURL((url) => url.pathname.includes("/confirmation") || url.pathname.includes("/thanks"), {
        timeout: 15000,
      })
      .catch(() => {});

    await this.page.waitForLoadState("domcontentloaded").catch(() => {});

    const currentUrl = this.page.url();
    const bodyText = await this.page.locator("body").innerText().catch(() => "");

    const SUCCESS_PHRASES = [
      "thank you for applying",
      "application submitted",
      "application received",
      "we'll be in touch",
      "successfully submitted",
      "we received your application",
    ];

    const isSuccess =
      currentUrl.includes("/confirmation") ||
      currentUrl.includes("/thanks") ||
      SUCCESS_PHRASES.some((phrase) => bodyText.toLowerCase().includes(phrase));

    if (postResponse && postResponse.status() >= 400) {
      const errorText = await this.page
        .locator("[class*='error'], [role='alert'], .error")
        .first()
        .innerText()
        .catch(() => "Unknown error");
      throw new Error(`[Ashby] Application rejected (${postResponse.status()}): ${errorText}`);
    }

    if (isSuccess) {
      console.log("✅ [Ashby] Application submitted successfully!");
      return { receipt, confirmationText: "Application submitted successfully" };
    }

    return { receipt, confirmationText: bodyText.slice(0, 300) };
  }
}
