import { BaseAdapter } from "./baseAdapter.js";

export class AshbyAdapter extends BaseAdapter {
  // ── Open ──────────────────────────────────────────────────────────────────

  async openApplication(jobUrl) {
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

        function safeCSSEscape(str) {
          if (!str) return "";
          return String(str).replace(/["\\]/g, "\\$&");
        }

        function isBlacklisted(el, name, type) {
          const id = el.id || "";
          const cls = typeof el.className === "string" ? el.className : "";
          const aria = el.getAttribute("aria-label") || "";
          const haystack = `${name || ""} ${id} ${cls} ${aria}`.toLowerCase();

          if (/recaptcha|captcha|honeypot|g-recaptcha/.test(haystack)) return true;
          if (type === "hidden") return true;
          if (type === "file") return true;
          if (el.tagName === "TEXTAREA" && /g-recaptcha-response/i.test(id || name || "")) {
            return true;
          }
          return false;
        }

        function extractLabel(el) {
          const isGrouped = el.type === "radio" || el.type === "checkbox";

          if (el.id && !isGrouped) {
            const labels = document.querySelectorAll("label[for]");
            for (const lbl of labels) {
              if (lbl.getAttribute("for") === el.id) {
                const txt = lbl.innerText.trim();
                if (txt) return txt;
              }
            }
          }

          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const parts = labelledBy.split(/\s+/);
            const texts = parts
              .map((id) => document.getElementById(id)?.innerText?.trim())
              .filter(Boolean);
            if (texts.length) return texts.join(" ");
          }

          const ariaLabel = el.getAttribute("aria-label");
          if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

          const fieldset = el.closest("fieldset");
          if (fieldset) {
            const legend = fieldset.querySelector("legend");
            if (legend?.innerText?.trim()) return legend.innerText.trim();
          }

          let node = el.parentElement;
          for (let d = 0; d < 8 && node; d++) {
            const heading = node.querySelector(
              ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > p, :scope > legend, :scope > [class*='label'], :scope > [class*='question'], :scope > [class*='title']"
            );
            if (heading && !heading.contains(el)) {
              const forAttr = heading.getAttribute?.("for");
              if (forAttr && forAttr !== el.id) {
                // belongs to another field
              } else if (!heading.querySelector?.("input, select, textarea")) {
                const txt = heading.innerText?.trim();
                if (txt && txt.length > 1 && txt.length < 300) {
                  if (
                    isGrouped &&
                    /^(yes|no|yes[\s\W].*|no[\s\W].*)$/i.test(txt) &&
                    txt.length < 80
                  ) {
                    // option label
                  } else {
                    return txt;
                  }
                }
              }
            }

            const candidates = Array.from(
              node.querySelectorAll(
                ":scope > label, :scope > span, :scope > div, :scope > p, :scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4"
              )
            ).filter((n) => {
              if (n.contains(el)) return false;
              const forAttr = n.getAttribute("for");
              if (forAttr && forAttr !== el.id) return false;
              if (n.querySelector("input, select, textarea")) return false;
              const txt = n.innerText?.trim();
              if (!txt || txt.length < 2 || txt.length > 300) return false;
              if (isGrouped && /^(yes\b|no\b)/i.test(txt) && txt.length < 80) return false;
              return true;
            });

            if (candidates.length > 0) {
              candidates.sort(
                (a, b) => (b.innerText?.trim().length || 0) - (a.innerText?.trim().length || 0)
              );
              return candidates[0].innerText.trim();
            }

            node = node.parentElement;
          }

          const placeholder = el.getAttribute("placeholder");
          if (placeholder && !/^(enter|type|select)/i.test(placeholder)) {
            return placeholder.trim();
          }

          return null;
        }

        for (const element of elements) {
          let name =
            element.getAttribute("name") ||
            element.id ||
            element.getAttribute("data-testid") ||
            null;

          const rawType =
            element.getAttribute("type") || element.tagName.toLowerCase();
          const type =
            rawType === "textarea"
              ? "textarea"
              : rawType === "select" || rawType === "select-one"
              ? "select"
              : rawType === "input" || !rawType
              ? "text"
              : rawType;

          if (isBlacklisted(element, name, type)) continue;

          const label = extractLabel(element);
          const isGrouped = type === "radio" || type === "checkbox";

          if (!name) {
            if (label) {
              name = label
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 80);
            }
            if (!name) name = `unnamed_${type}_${result.length}`;
          }

          const dedupeKey = isGrouped
            ? `group:${type}:${name}`
            : `field:${type}:${name}:${label ?? ""}`;

          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          if (label) {
            const labelKey = `label:${type}:${label.toLowerCase().slice(0, 120)}`;
            if (!isGrouped || type === "checkbox") {
              if (seen.has(labelKey) && type === "checkbox") {
                const sameLabelCount = result.filter(
                  (r) => r.type === "checkbox" && r.label === label
                ).length;
                if (sameLabelCount >= 1) continue;
              }
              seen.add(labelKey);
            }
          }

          let options = [];

          if (type === "select") {
            options = Array.from(element.options)
              .map((o) => ({ value: o.value, label: o.textContent.trim() }))
              .filter((o) => o.label);
          }

          if (isGrouped) {
            const selector = name
              ? `input[type="${type}"][name="${safeCSSEscape(name)}"]`
              : null;
            const group = selector
              ? Array.from(document.querySelectorAll(selector))
              : [element];

            options = group.map((inp) => {
              let optLabel = "";
              if (inp.id) {
                const lbl = document.querySelector(
                  `label[for="${safeCSSEscape(inp.id)}"]`
                );
                if (lbl) optLabel = lbl.innerText.trim();
              }
              if (!optLabel) {
                const parentLabel = inp.closest("label");
                if (parentLabel) optLabel = parentLabel.innerText.trim();
              }
              if (!optLabel) optLabel = inp.value || "on";
              return { value: inp.value || "on", label: optLabel };
            });
          }

          result.push({
            id: element.id || null,
            name,
            label,
            type,
            required: !!element.required,
            placeholder: element.getAttribute("placeholder"),
            ariaLabel: element.getAttribute("aria-label"),
            options,
          });
        }

        return result;
      });

    for (const field of fields) {
      if (field.label) continue;
      if (/recaptcha|captcha|honeypot/i.test(field.name || "")) continue;

      const rescued = await this.page
        .evaluate((fieldName) => {
          const el =
            document.querySelector(`[name="${fieldName}"]`) ||
            document.querySelector(`#${CSS.escape?.(fieldName) || fieldName}`);
          if (!el) return null;

          let node = el.parentElement;
          for (let d = 0; d < 6 && node; d++) {
            if (["MAIN", "ARTICLE", "BODY", "HTML"].includes(node.tagName)) break;

            const leafTextEls = Array.from(
              node.querySelectorAll("label, span, div, p, legend, h2, h3, h4")
            ).filter(
              (n) =>
                !n.contains(el) &&
                n.children.length === 0 &&
                n.innerText?.trim().length > 1 &&
                n.innerText?.trim().length < 200
            );
            for (const t of leafTextEls) {
              const txt = t.innerText?.trim();
              if (txt && !/^(yes|no)\b/i.test(txt)) return txt;
            }
            node = node.parentElement;
          }
          return null;
        }, field.name)
        .catch(() => null);

      if (rescued) {
        console.log(`[ASHBY LABEL RESCUE] ${field.name} → "${rescued}"`);
        field.label = rescued;
      }
    }

    const cleaned = fields.filter((f) => {
      const blob = `${f.name || ""} ${f.id || ""} ${f.label || ""}`.toLowerCase();
      if (/recaptcha|g-recaptcha|captcha/.test(blob)) {
        console.log(`[Ashby] Dropping captcha field: ${f.name}`);
        return false;
      }
      return true;
    });

    console.log(
      `[Ashby] Extracted ${cleaned.length} fields:`,
      cleaned.map((f) => `${f.name} (${f.type})`).join(", ")
    );

    return cleaned;
  }

  // ── Fill a single field ───────────────────────────────────────────────────

  async fillField(field, value) {
    if (value === undefined || value === null) {
      console.warn(`[Ashby] Skipping field with no value: ${field.label || field.name}`);
      return;
    }

    const identity = `${field.name || ""} ${field.id || ""} ${field.label || ""}`.toLowerCase();
    if (/recaptcha|g-recaptcha|captcha|honeypot/.test(identity)) {
      console.log(`[Ashby] Skipping captcha/honeypot field: ${field.name}`);
      return;
    }

    const fieldLabel = field.label || field.name || "(unknown)";
    console.log(`[Ashby] Filling "${fieldLabel}" → ${JSON.stringify(value)}`);

    let locator = null;
    let lastError = null;

    const strategies = [
      () => (field.label ? this.page.getByLabel(field.label, { exact: true }) : null),
      () => (field.label ? this.page.getByLabel(field.label, { exact: false }) : null),
      () => (field.id ? this.page.locator(`[id="${field.id.replace(/"/g, '\\"')}"]`) : null),
      () => (field.name ? this.page.locator(`[name="${field.name.replace(/"/g, '\\"')}"]`) : null),
      () => (field.ariaLabel ? this.page.getByLabel(field.ariaLabel, { exact: false }) : null),
      () =>
        field.placeholder
          ? this.page.getByPlaceholder(field.placeholder, { exact: false })
          : null,
    ];

    for (const strategy of strategies) {
      try {
        const candidate = strategy();
        if (candidate && (await candidate.count()) > 0) {
          locator = candidate.first();
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!locator && field.label) {
      try {
        const found = await this.page.evaluate((labelText) => {
          const allInputs = Array.from(
            document.querySelectorAll(
              "input:not([type='hidden']):not([type='file']), textarea, select"
            )
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
          else if (found.placeholder)
            locator = this.page.getByPlaceholder(found.placeholder, { exact: false });
          else
            locator = this.page
              .locator(
                "input:not([type='hidden']):not([type='file']), textarea, select"
              )
              .nth(found.index);
          if (locator) console.log(`[Ashby] Located "${fieldLabel}" via container text search`);
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!locator) {
      console.warn(`⚠️ [Ashby] Could not locate field "${fieldLabel}" — skipping.`);
      if (lastError) console.warn(`Last error: ${lastError.message}`);
      return;
    }

    const executeWithRetry = async (operation, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await operation();
          return;
        } catch (error) {
          console.warn(
            `[Ashby] Attempt ${attempt}/${maxRetries} failed for "${fieldLabel}": ${error.message}`
          );
          if (attempt === maxRetries) throw error;
          await this.page.waitForTimeout(500);
        }
      }
    };

    // ── SELECT ──────────────────────────────────────────────────────────────
    if (field.type === "select") {
      await executeWithRetry(async () => {
        try {
          await locator.selectOption({ value: String(value) });
        } catch {
          const options = await locator.locator("option").allInnerTexts();
          const matched = options.find(
            (opt) => opt.trim().toLowerCase() === String(value).trim().toLowerCase()
          );
          if (matched) await locator.selectOption({ label: matched.trim() });
          else throw new Error(`Option "${value}" not found in select "${fieldLabel}"`);
        }
      });
      return;
    }

    // ── RADIO ───────────────────────────────────────────────────────────────
    if (field.type === "radio") {
      await executeWithRetry(async () => {
        const radios = field.name
          ? this.page.locator(`input[type="radio"][name="${field.name}"]`)
          : locator;
        const count = await radios.count();

        if (count === 0) {
          throw new Error(`No radio buttons found for "${fieldLabel}"`);
        }

        const target = String(value).trim().toLowerCase();
        let matched = null;

        for (let i = 0; i < count; i++) {
          const r = radios.nth(i);
          const val = (await r.getAttribute("value"))?.trim().toLowerCase() ?? "";

          if (val === target) {
            matched = r;
            break;
          }

          const id = await r.getAttribute("id");
          if (id) {
            const lblText = await this.page
              .locator(`label[for="${id}"]`)
              .innerText()
              .catch(() => "");
            if (lblText.trim().toLowerCase() === target) {
              matched = r;
              break;
            }
          }

          const wrapLabel = await r
            .locator("xpath=ancestor::label")
            .first()
            .innerText()
            .catch(() => "");
          if (wrapLabel.trim().toLowerCase() === target) {
            matched = r;
            break;
          }

          if (field.options?.length) {
            const optMatch = field.options.find(
              (o) =>
                String(o.value).toLowerCase() === target ||
                String(o.label).toLowerCase() === target
            );
            if (optMatch && val === String(optMatch.value).toLowerCase()) {
              matched = r;
              break;
            }
          }
        }

        if (!matched) {
          for (let i = 0; i < count; i++) {
            const r = radios.nth(i);
            const val = (await r.getAttribute("value"))?.trim().toLowerCase() ?? "";
            const id = await r.getAttribute("id");
            let lblText = "";
            if (id) {
              lblText = await this.page
                .locator(`label[for="${id}"]`)
                .innerText()
                .catch(() => "");
            }
            const blob = `${val} ${lblText}`.toLowerCase();
            if (
              (/^(yes|given|true|consent)/i.test(target) || target === "y") &&
              /yes|given|consent/.test(blob) &&
              !/\bno\b|do not|don't/.test(blob)
            ) {
              matched = r;
              break;
            }
            if (
              (/^(no|denied|false)/i.test(target) || target === "n") &&
              (/\bno\b|do not|don't|denied/.test(blob) || val === "denied")
            ) {
              matched = r;
              break;
            }
          }
        }

        if (!matched) {
          if (count === 1 && target && target !== "false" && target !== "no") {
            matched = radios.first();
            console.warn(
              `[Ashby] No exact radio match — selecting only option for "${fieldLabel}"`
            );
          } else {
            throw new Error(
              `Radio option "${value}" not found for "${fieldLabel}". ` +
                `Available: ${JSON.stringify(field.options?.map((o) => o.label) ?? [])}`
            );
          }
        }

        const id = await matched.getAttribute("id");
        if (id) {
          const lbl = this.page.locator(`label[for="${id}"]`);
          if ((await lbl.count()) > 0 && (await lbl.isVisible().catch(() => false))) {
            await lbl.click({ force: true });
            return;
          }
        }

        const wrap = matched.locator("xpath=ancestor::label[1]");
        if ((await wrap.count()) > 0 && (await wrap.isVisible().catch(() => false))) {
          await wrap.click({ force: true });
          return;
        }

        await matched
          .evaluate((el) => {
            el.checked = true;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          })
          .catch(async () => {
            await matched.check({ force: true }).catch(() => {});
          });
      });
      return;
    }

    // ── CHECKBOX ────────────────────────────────────────────────────────────
    if (field.type === "checkbox") {
      await executeWithRetry(async () => {
        let values;
        if (Array.isArray(value)) {
          values = value
            .filter(
              (v) =>
                typeof v === "string" ||
                typeof v === "number" ||
                typeof v === "boolean"
            )
            .map((v) => String(v).trim().toLowerCase());
        } else if (typeof value === "object" && value !== null) {
          values = [String(value.value ?? value.label ?? "").trim().toLowerCase()];
        } else {
          values = [String(value).trim().toLowerCase()];
        }

        const truthy = new Set(["true", "on", "yes", "1", "checked", "agree", "given"]);
        const falsy = new Set(["false", "off", "no", "0", "unchecked"]);

        const setCheckbox = async (cb, shouldCheck) => {
          const currently = await cb.isChecked().catch(() => false);
          if (shouldCheck === currently) return;

          const id = await cb.getAttribute("id");
          if (id) {
            const lbl = this.page.locator(`label[for="${id}"]`).first();
            if ((await lbl.count()) > 0 && (await lbl.isVisible().catch(() => false))) {
              await lbl.click({ force: true });
              const after = await cb.isChecked().catch(() => currently);
              if (after === shouldCheck) return;
            }
          }

          const wrap = cb.locator("xpath=ancestor::label[1]");
          if ((await wrap.count()) > 0 && (await wrap.isVisible().catch(() => false))) {
            await wrap.click({ force: true });
            const after = await cb.isChecked().catch(() => currently);
            if (after === shouldCheck) return;
          }

          const parent = cb.locator("xpath=..");
          const custom = parent
            .locator(
              '[role="checkbox"], button, [class*="checkbox"], [class*="Checkbox"], [data-state]'
            )
            .first();
          if ((await custom.count()) > 0 && (await custom.isVisible().catch(() => false))) {
            await custom.click({ force: true }).catch(() => {});
            const after = await cb.isChecked().catch(() => currently);
            if (after === shouldCheck) return;
          }

          await cb
            .evaluate((el, checked) => {
              if (el.checked === checked) return;
              el.checked = checked;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            }, shouldCheck)
            .catch(() => {});
        };

        const checkboxes = field.name
          ? this.page.locator(`input[type="checkbox"][name="${field.name}"]`)
          : this.page.locator('input[type="checkbox"]').and(locator);

        let count = await checkboxes.count();

        if (count === 0) {
          const isCb = await locator
            .evaluate((el) => el.type === "checkbox")
            .catch(() => false);
          if (isCb) {
            const shouldCheck =
              values.some((v) => truthy.has(v)) ||
              (values[0] && !falsy.has(values[0]));
            const shouldUncheck = values.some((v) => falsy.has(v));
            if (shouldUncheck) await setCheckbox(locator, false);
            else if (shouldCheck) await setCheckbox(locator, true);
            return;
          }
          console.warn(`[Ashby] No checkbox found for "${fieldLabel}" — skipping`);
          return;
        }

        if (count === 1) {
          const v = values[0] ?? "true";
          if (falsy.has(v)) await setCheckbox(checkboxes.first(), false);
          else await setCheckbox(checkboxes.first(), true);
          return;
        }

        for (const targetVal of values) {
          if (truthy.has(targetVal)) {
            await setCheckbox(checkboxes.first(), true);
            continue;
          }
          if (falsy.has(targetVal)) {
            for (let i = 0; i < count; i++) {
              await setCheckbox(checkboxes.nth(i), false);
            }
            continue;
          }

          let found = false;
          for (let i = 0; i < count; i++) {
            const cb = checkboxes.nth(i);
            const val = (await cb.getAttribute("value"))?.trim().toLowerCase() ?? "";

            let labelText = "";
            const id = await cb.getAttribute("id");
            if (id) {
              labelText = (
                await this.page.locator(`label[for="${id}"]`).innerText().catch(() => "")
              )
                .trim()
                .toLowerCase();
            }
            if (!labelText) {
              labelText = (
                await cb.locator("xpath=ancestor::label").first().innerText().catch(() => "")
              )
                .trim()
                .toLowerCase();
            }

            if (
              val === targetVal ||
              labelText === targetVal ||
              labelText.includes(targetVal)
            ) {
              await setCheckbox(cb, true);
              found = true;
              break;
            }
          }

          if (!found) {
            console.warn(
              `[Ashby] Checkbox option "${targetVal}" not found in "${fieldLabel}"`
            );
          }
        }
      });
      return;
    }

    // ── LOCATION / TYPEAHEAD ────────────────────────────────────────────────
    const isLocationField =
      /location|city|address/i.test(field.label || "") ||
      /location|city|address/i.test(field.placeholder || "") ||
      /location|city|address/i.test(field.ariaLabel || "");

    if (isLocationField) {
      await executeWithRetry(async () => {
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
          if (
            (await suggestion.count()) > 0 &&
            (await suggestion.isVisible().catch(() => false))
          ) {
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
      });
      return;
    }

    // ── TEXT / TEXTAREA ──────────────────────────────────────────────────────
    await executeWithRetry(async () => {
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) {
        console.warn(`[Ashby] Field "${fieldLabel}" not visible — using force fill`);
        await locator.fill(String(value), { force: true }).catch(async () => {
          await locator.evaluate((el, v) => {
            el.value = v;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }, String(value));
        });
        return;
      }
      await locator.click().catch(() => {});
      await locator.fill(String(value));
      await locator.dispatchEvent("input");
      await locator.dispatchEvent("change");
    });
  }

  // ── Resume upload ─────────────────────────────────────────────────────────

  async uploadResume(filePath) {
    if (!filePath) throw new Error("Resume file path is required");

    await this.page.waitForTimeout(2000);

    let resumeInput = null;

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
        }
      } catch {
        // continue
      }
    }

    const FILE_SELECTORS = [
      "input[type='file'][name*='resume' i]",
      "input[type='file'][id*='resume' i]",
      "input[type='file'][accept*='pdf']",
      "input[type='file'][accept*='.pdf']",
      "input[type='file'][accept*='doc']",
      "input[type='file'][accept*='.doc']",
      "input[type='file']",
    ];

    for (const selector of FILE_SELECTORS) {
      try {
        const candidate = this.page.locator(selector).first();
        await candidate.waitFor({ state: "attached", timeout: 5000 });
        
        const hasFiles = await candidate.evaluate((input) => input.files && input.files.length > 0);
        if (!hasFiles) {
          resumeInput = candidate;
          console.log(`📎 [Ashby] File input found: ${selector}`);
          break;
        }
      } catch {
        // continue
      }
    }

    if (!resumeInput) {
      console.warn("[Ashby] No file input found — trying enhanced JS DataTransfer injection...");

      try {
        const fs = await import("fs");
        const path = await import("path");

        const fileBuffer = fs.readFileSync(filePath);
        const base64 = fileBuffer.toString("base64");
        const mimeType = filePath.toLowerCase().endsWith(".pdf") 
          ? "application/pdf" 
          : filePath.toLowerCase().includes(".doc")
          ? "application/msword"
          : "application/octet-stream";
        const fileName = path.basename(filePath);

        const injected = await this.page.evaluate(
          async ({ base64Data, mimeType, fileName }) => {
            try {
              const byteChars = atob(base64Data);
              const byteNums = new Uint8Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) {
                byteNums[i] = byteChars.charCodeAt(i);
              }
              const blob = new Blob([byteNums], { type: mimeType });
              const file = new File([blob], fileName, { type: mimeType });

              const inputs = Array.from(document.querySelectorAll("input[type='file']"));
              let success = false;

              for (const input of inputs) {
                try {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  input.files = dt.files;
                  
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  
                  let parent = input.parentElement;
                  let depth = 0;
                  while (parent && depth < 3) {
                    parent.dispatchEvent(new CustomEvent("fileselected", { 
                      detail: { files: [file] }, 
                      bubbles: true 
                    }));
                    parent = parent.parentElement;
                    depth++;
                  }
                  
                  success = true;
                } catch (e) {
                  // continue
                }
              }

              return success;
            } catch {
              return false;
            }
          },
          { base64Data: base64, mimeType, fileName }
        );

        if (injected) {
          console.log("✅ [Ashby] Resume injected via enhanced JS DataTransfer");
          await this.page.waitForTimeout(3000);
          return;
        }
      } catch (err) {
        console.error("[Ashby] Enhanced DataTransfer injection failed:", err.message);
      }

      throw new Error("[Ashby] Resume upload failed: could not find file input.");
    }

    let uploaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await resumeInput.setInputFiles(filePath);
        await resumeInput.dispatchEvent("change").catch(() => {});
        await resumeInput.dispatchEvent("input").catch(() => {});
        uploaded = true;
        break;
      } catch (error) {
        console.warn(`[Ashby] Upload attempt ${attempt}/3 failed: ${error.message}`);
        if (attempt < 3) {
          await this.page.waitForTimeout(1000);
        } else {
          throw error;
        }
      }
    }

    if (!uploaded) {
      throw new Error("[Ashby] Failed to upload resume after 3 attempts");
    }

    const confirmationDetected = await this.page
      .waitForFunction(
        () => {
          const body = document.body.innerText;
          const indicators = [
            body.includes(".pdf"),
            body.includes(".doc"), 
            body.includes("uploaded"),
            body.includes("attached"),
            document.querySelector("[class*='upload-success'], [class*='file-name'], [data-testid*='file']") !== null,
            document.querySelector("[class*='uploaded'], [class*='attached']") !== null
          ];
          return indicators.some(indicator => indicator);
        },
        { timeout: 10000 }
      )
      .catch(() => false);

    if (confirmationDetected) {
      console.log(`✅ [Ashby] Resume uploaded and confirmed: ${filePath}`);
    } else {
      console.log(`⚠️ [Ashby] Resume uploaded: ${filePath}`);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async submit() {
    console.log("[Ashby] Collecting filled-application receipt (submission is currently disabled)...");

    const receipt = await this.page.evaluate(() => {
      const data = {};
      const inputs = document.querySelectorAll(
        "input:not([type='hidden']):not([type='file']), textarea, select"
      );
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

    console.log("✅ [Ashby] Application filled — stopping before submission (disabled).");
    return {
      receipt,
      confirmationText: "[Ashby] Application filled — submission disabled.",
      submitted: false,
    };
  }

}
