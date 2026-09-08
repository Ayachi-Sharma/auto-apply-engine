import { BaseAdapter } from "./baseAdapter.js";

/**
 * WorkableAdapter — Complete implementation for Workable ATS.
 * Handles apply.workable.com domain with job URL patterns like /company/j/ABC123DEF456/
 * Supports field extraction, form filling, resume upload, and submission.
 */
export class WorkableAdapter extends BaseAdapter {
  async openApplication(jobUrl) {
    // Extract shortcode for API access (reliable label source)
    const shortcodeMatch = jobUrl.match(/\/j\/([^\/\?\/]+)/);
    if (shortcodeMatch) {
      this.shortcode = shortcodeMatch[1];
      await this._loadFormDefinition();
    }

    // Strip query strings and fragments before processing
    // Workable job URLs are typically:
    // - https://apply.workable.com/company/j/ABC123DEF456/
    // - https://apply.workable.com/company/j/ABC123DEF456/apply/
    let cleanUrl;
    try {
      const parsed = new URL(jobUrl);
      // Keep only origin + pathname, drop search params and hash
      cleanUrl = parsed.origin + parsed.pathname.replace(/\/$/, "");
    } catch {
      cleanUrl = jobUrl.split("?")[0].split("#")[0].replace(/\/$/, "");
    }

    // Ensure we navigate to the application form
    const applicationUrl = cleanUrl.includes("/apply")
      ? cleanUrl
      : `${cleanUrl}/apply`;

    console.log("Opening Workable application:", applicationUrl);

    await this.page.goto(applicationUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    // networkidle can timeout on slow/ad-heavy pages — treat it as optional.
    await this.page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
      console.warn("⚠️ networkidle timed out — continuing anyway.");
    });

    // Wait for the application form to load (Workable uses React/JS)
    const formReady = await this.page
      .waitForFunction(
        () => {
          const inputs = document.querySelectorAll(
            "input:not([type='hidden']), textarea, select"
          );
          return inputs.length > 0;
        },
        { timeout: 30000 }
      )
      .catch(() => null);

    if (!formReady) {
      const pageText = await this.page.locator("body").innerText().catch(() => "");
      console.warn("⚠️ Workable form did not render. Page text sample:", pageText.slice(0, 500));
      console.warn("Current URL:", this.page.url());
    } else {
      console.log("✅ Workable application form loaded");
    }

    console.log("✅ Workable application opened");
    console.log("URL:", this.page.url());
    console.log("Title:", await this.page.title());
  }

  async _loadFormDefinition() {
    const url = `https://apply.workable.com/api/v1/jobs/${this.shortcode}/form`;
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        console.warn(`⚠️ Workable form API returned ${response.status} — falling back to DOM extraction`);
        this.formDef = null;
        return;
      }
      this.formDef = await response.json();
      console.log(`✅ Workable form definition loaded (${this.formDef.length} sections)`);
    } catch (err) {
      console.warn(`⚠️ Failed to load Workable form definition: ${err.message}`);
      this.formDef = null;
    }
  }

  async getFields() {
    // ── Build label lookup from form definition (authoritative source) ────────
    const labelById = new Map();
    if (this.formDef) {
      const collectLabels = (fields) => {
        if (!fields) return;
        for (const field of fields) {
          if (field.id) labelById.set(field.id, field.label || field.id);
          if (field.fields) collectLabels(field.fields); // nested groups
        }
      };
      for (const section of this.formDef) {
        collectLabels(section.fields);
      }
    }

    const fields = await this.page
      .locator("input:not([type='hidden']), textarea, select")
      .evaluateAll(
        (elements, labelById) => {
          const result = [];
          const seen = new Set();

          for (const element of elements) {
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

            // ── Workable form-definition label (authoritative) ────────────────
            const formDefLabel = labelById[element.id] || null;

          // ── helper: extract the best label from a container ──────────────
          function extractLabelFromContainer(container) {
            if (!container) return null;

            // 1. Explicit <label> element
            const lbl = container.querySelector("label");
            if (lbl) {
              const txt = lbl.innerText.trim();
              if (txt) return txt;
            }

            // 2. Common Workable label selectors
            const labelSelectors = [
              "[class*='question-label']",
              "[class*='field-label']",
              "[class*='form-label']",
              ".label",
              "[data-cy*='label']",
              "[class*='input-label']",
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
              ".form-field, .question, [class*='field'], [class*='question'], .input-group"
            );
            label = extractLabelFromContainer(container);

            // Workable form-definition label (authoritative)
            if (!label && formDefLabel) label = formDefLabel;

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
              ".form-field, .question, [class*='field'], [class*='question'], .input-group, fieldset, li"
            );

            // Workable form-definition label (authoritative)
            if (!label && formDefLabel) label = formDefLabel;

            // Try to find the question label (the main question text)
            // Strategy 1: Use aria-labelledby on the container (Workable specific)
            if (!label && container) {
              const ariaLabelledBy = container.getAttribute("aria-labelledby");
              if (ariaLabelledBy) {
                // Handle space-separated aria-labelledby values
                const ids = ariaLabelledBy.split(/\s+/);
                for (const id of ids) {
                  const ariaLabelElement = document.getElementById(id);
                  if (ariaLabelElement) {
                    const text = ariaLabelElement.innerText.trim();
                    if (text && text.length > 0) {
                      label = text;
                      break;
                    }
                  }
                }
              }
            }

            // Strategy 2: Look for legend in fieldset
            if (!label && container) {
              const legend = container.querySelector("legend");
              if (legend) {
                label = legend.innerText.trim();
              }
            }

            // Strategy 3: Look for the first label that's not associated with an option
            if (!label && container) {
              const allLabels = Array.from(container.querySelectorAll("label"));
              const optionLabels = group
                .filter(input => input.id)
                .map(input => document.querySelector(`label[for="${CSS.escape(input.id)}"]`))
                .filter(Boolean);
              
              const questionLabel = allLabels.find(l => !optionLabels.includes(l));
              if (questionLabel) {
                label = questionLabel.innerText.trim();
              }
            }

            // Strategy 4: Look for heading elements
            if (!label && container) {
              const heading = container.querySelector(
                "h1, h2, h3, h4, h5, h6, .question-text, [class*='question-text'], [class*='question-label'], .field-label"
              );
              if (heading) label = heading.innerText.trim();
            }

            // Strategy 5: Try to get the question from the container's previous sibling
            if (!label && container) {
              const prevSibling = container.previousElementSibling;
              if (prevSibling) {
                try {
                  const text = prevSibling.innerText;
                  if (text && typeof text === 'string') {
                    const trimmed = text.trim();
                    if (trimmed && trimmed.length < 300) {
                      label = trimmed;
                    }
                  }
                } catch {
                  // skip
                }
              }
            }

            // Strategy 6: Try to get the question from the parent container's parent (Workable structure)
            if (!label && container && container.parentElement) {
              const parentContainer = container.parentElement;
              try {
                const parentText = parentContainer.innerText;
                const containerText = container.innerText;
                if (parentText && containerText && parentText !== containerText) {
                  const questionText = parentText.replace(containerText, "").trim();
                  if (questionText && questionText.length < 300 && questionText.length > 5) {
                    label = questionText;
                  }
                }
              } catch {
                // skip
              }
            }

            // Strategy 7: Look for a broader container (2 levels up)
            if (!label && container && container.parentElement && container.parentElement.parentElement) {
              const grandParent = container.parentElement.parentElement;
              try {
                const grandParentText = grandParent.innerText;
                const containerText = container.innerText;
                if (grandParentText && containerText && grandParentText !== containerText) {
                  const questionText = grandParentText.replace(containerText, "").trim();
                  if (questionText && questionText.length < 300 && questionText.length > 5) {
                    label = questionText;
                  }
                }
              } catch {
                // skip
              }
            }

            // Last resort: use the field name as the label
            if (!label) {
              label = name;
            }

            options = group.map((input) => {
              let optionLabel = input.value;
              
              // Strategy 1: Look for aria-labelledby on the wrapper (Workable specific)
              const wrapper = input.closest("[role='radio'], [role='checkbox']");
              if (wrapper) {
                const ariaLabelledBy = wrapper.getAttribute("aria-labelledby");
                if (ariaLabelledBy) {
                  const ariaLabelElement = document.getElementById(ariaLabelledBy);
                  if (ariaLabelElement) {
                    optionLabel = ariaLabelElement.innerText.trim();
                  }
                }
              }
              
              // Strategy 2: Look for label[for=id]
              if (!optionLabel || optionLabel === input.value) {
                if (input.id) {
                  const optionLabelElement = document.querySelector(
                    `label[for="${CSS.escape(input.id)}"]`
                  );
                  if (optionLabelElement) {
                    optionLabel = optionLabelElement.innerText.trim();
                  }
                }
              }
              
              // Strategy 3: Look for label that contains this input
              if (!optionLabel || optionLabel === input.value) {
                const parent = input.parentElement;
                if (parent) {
                  try {
                    const parentLabel = parent.querySelector("label");
                    if (parentLabel) {
                      optionLabel = parentLabel.innerText.trim();
                    }
                  } catch {
                    // skip
                  }
                }
              }
              
              // Strategy 4: Get text from parent element (excluding the input itself)
              if (!optionLabel || optionLabel === input.value) {
                const parent = input.parentElement;
                if (parent) {
                  try {
                    // Clone the parent and remove the input to get just the label text
                    const clone = parent.cloneNode(true);
                    const inputInClone = clone.querySelector("input");
                    if (inputInClone) {
                      inputInClone.remove();
                    }
                    optionLabel = clone.innerText.trim();
                  } catch {
                    // skip
                  }
                }
              }
              
              // Strategy 5: Look for the next sibling that's a label
              if (!optionLabel || optionLabel === input.value) {
                const nextSibling = input.nextElementSibling;
                if (nextSibling) {
                  try {
                    optionLabel = nextSibling.innerText.trim();
                  } catch {
                    // skip
                  }
                }
              }
              
              // Strategy 6: Look for the previous sibling that's a label
              if (!optionLabel || optionLabel === input.value) {
                const prevSibling = input.previousElementSibling;
                if (prevSibling) {
                  try {
                    optionLabel = prevSibling.innerText.trim();
                  } catch {
                    // skip
                  }
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
          // Priority 0: Workable form-definition label (authoritative)
          if (!label && formDefLabel) label = formDefLabel;

          // Priority 1: label[for=id]
          if (!label && element.id) {
            const labelElement = document.querySelector(
              `label[for="${CSS.escape(element.id)}"]`
            );
            if (labelElement) label = labelElement.innerText.trim();
          }

          // Priority 2: aria-labelledby on the input (Workable specific)
          if (!label) {
            const ariaLabelledBy = element.getAttribute("aria-labelledby");
            if (ariaLabelledBy) {
              // Handle space-separated aria-labelledby values
              const ids = ariaLabelledBy.split(/\s+/);
              for (const id of ids) {
                const ariaLabelElement = document.getElementById(id);
                if (ariaLabelElement) {
                  const text = ariaLabelElement.innerText.trim();
                  if (text && text.length > 0) {
                    label = text;
                    break;
                  }
                }
              }
            }
          }

          // Priority 3: Check parent element for aria-labelledby (for phone, gdpr, etc.)
          if (!label) {
            const parent = element.parentElement;
            if (parent) {
              const parentAriaLabelledBy = parent.getAttribute("aria-labelledby");
              if (parentAriaLabelledBy) {
                const ids = parentAriaLabelledBy.split(/\s+/);
                for (const id of ids) {
                  const ariaLabelElement = document.getElementById(id);
                  if (ariaLabelElement) {
                    const text = ariaLabelElement.innerText.trim();
                    if (text && text.length > 0) {
                      label = text;
                      break;
                    }
                  }
                }
              }
            }
          }

          // Priority 4: walk up to any question container and extract text
          if (!label) {
            // Try increasingly broad containers for Workable
            const containerSelectors = [
              ".form-field",
              ".question",
              "[class*='field']",
              "[class*='question']",
              "[class*='form-group']",
              ".input-group",
            ];
            for (const sel of containerSelectors) {
              const container = element.closest(sel);
              if (container) {
                label = extractLabelFromContainer(container);
                if (label) break;
              }
            }
          }

          // Priority 5: aria-label
          if (!label) {
            const ariaLbl = element.getAttribute("aria-label");
            if (ariaLbl) label = ariaLbl.trim();
          }

          // Priority 6: Check parent for aria-label
          if (!label) {
            const parent = element.parentElement;
            if (parent) {
              const parentAriaLabel = parent.getAttribute("aria-label");
              if (parentAriaLabel) label = parentAriaLabel.trim();
            }
          }

          // Priority 7: aria-describedby
          if (!label) {
            const describedById = element.getAttribute("aria-describedby");
            if (describedById) {
              const descEl = document.getElementById(describedById);
              if (descEl) label = descEl.innerText.trim();
            }
          }

          // Priority 8: placeholder as label hint
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
              const c = element.closest(".form-field, .question, [class*='field'], [class*='question'], fieldset, li, .input-group");
              return c ? c.outerHTML.slice(0, 600) : null;
            })(),
          });
        }

        return result;
      }, labelById);

    // ── Phase 2: targeted label rescue for fields with missing labels ────────
    for (const field of fields) {
      const hasRealLabel = field.label && field.label.length > 0;

      if (!hasRealLabel) {
        // Dump the container HTML so we can see what Workable actually renders
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

    // 4. LOCATION FIELD HANDLING
    // Workable often has location fields with autocomplete/typeahead
    if (field.name === "location" || /location|address|city/i.test(field.label || "")) {
      await locator.click();
      await this.page.waitForTimeout(300); // Give JS time to bind
      await locator.fill(String(value));
      await this.page.waitForTimeout(800); // Wait for API response
      
      // Look for Workable autocomplete suggestions
      const suggestion = this.page.locator(".autocomplete-item, .suggestion, .dropdown-item, [role='option']").first();
      if (await suggestion.isVisible().catch(() => false)) {
        await suggestion.click().catch(() => {});
      }
    } else {
      // 5. REGULAR TEXT / TEXTAREA
      await locator.fill(String(value));
      
      // Trigger React form validation events (Workable uses React)
      await locator.dispatchEvent("input");
      await locator.dispatchEvent("change");
      await locator.dispatchEvent("blur");
    }
  }

  async uploadResume(filePath) {
    if (!filePath) throw new Error("Resume file path is required");

    // Try multiple selectors Workable uses across different form versions
    const RESUME_SELECTORS = [
      "input[type='file'][name*='resume']",
      "input[type='file'][name*='cv']",
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

    // If no direct file input found, look for upload buttons/zones
    if (!resumeInput) {
      const uploadButton = this.page.locator(
        "button:has-text('Upload'), button:has-text('Choose File'), [class*='upload-btn'], [data-cy*='upload']"
      ).first();
      
      if (await uploadButton.count() > 0) {
        console.log("📎 Upload button found, clicking to reveal file input...");
        await uploadButton.click();
        await this.page.waitForTimeout(1000);
        
        // Try to find the file input again after clicking
        for (const selector of RESUME_SELECTORS) {
          const candidate = this.page.locator(selector).first();
          if (await candidate.count() > 0) {
            resumeInput = candidate;
            console.log(`📎 Resume input found after button click: ${selector}`);
            break;
          }
        }
      }
    }

    if (!resumeInput) {
      throw new Error(
        "Resume upload input not found. The page may not have loaded correctly or this job does not accept resume uploads."
      );
    }

    await resumeInput.setInputFiles(filePath);

    // Wait for Workable to finish processing the upload
    try {
      await this.page.waitForFunction(() => {
        // Look for success indicators in Workable forms
        const successIndicators = [
          document.querySelector('[class*="upload-success"]'),
          document.querySelector('[class*="file-uploaded"]'),
          document.querySelector('.file-name'),
          document.querySelector('[class*="uploaded"]'),
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
    console.log("Collecting Workable filled-application receipt (submission is currently disabled)...");

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

    console.log("✅ Workable application filled — stopping before submission (disabled).");
    return {
      receipt: rawReceipt,
      confirmationText: "Application filled — submission disabled.",
      submitted: false,
    };
  }

}
