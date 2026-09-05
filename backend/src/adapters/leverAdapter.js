import { BaseAdapter } from "./baseAdapter.js";

export class LeverAdapter extends BaseAdapter {
async openApplication(jobUrl) {
  const applicationUrl = jobUrl.endsWith("/apply")
    ? jobUrl
    : `${jobUrl.replace(/\/$/, "")}/apply`;

  console.log("Opening Lever application:", applicationUrl);

  await this.page.goto(applicationUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await this.page.waitForLoadState("networkidle");

  console.log("✅ Lever application opened");
  console.log("URL:", this.page.url());
  console.log("Title:", await this.page.title());
}

async getFields() {
  const fields = await this.page.locator(
    "input:not([type='hidden']), textarea, select"
  ).evaluateAll((elements) => {
    const result = [];
    const seen = new Set();

    for (const element of elements) {
      // Ignore Lever's internal custom-pronoun controls
      if (
        element.id === "customPronounsOption" ||
        element.id === "customPronounsTextField"
      ) {
        continue;
      }

      const name = element.getAttribute("name");
      const type =
        element.getAttribute("type") || element.tagName.toLowerCase();

      // Radio/checkbox fields represent one logical question
      const isGrouped = type === "radio" || type === "checkbox";

      const key = isGrouped
        ? `${type}:${name}`
        : `${type}:${name || element.id || result.length}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      let label = null;

      // --------------------------------------------------
// 1. Select fields
// --------------------------------------------------
let options = [];

if (type === "select") {
  const container = element.closest(
    ".application-question, .question, .field"
  );

  if (container) {
    const labelElement = container.querySelector("label");

    if (labelElement) {
      label = labelElement.innerText.trim();
    }
  }

  // Fallback: label associated through "for"
  if (!label && element.id) {
    const labelElement = document.querySelector(
      `label[for="${CSS.escape(element.id)}"]`
    );

    if (labelElement) {
      label = labelElement.innerText.trim();
    }
  }

  // Extract dropdown options
  options = Array.from(element.options)
    .map((option) => ({
      value: option.value,
      label: option.textContent.trim(),
    }))
    .filter((option) => option.label);
}

      // --------------------------------------------------
      // 2. Radio / checkbox fields
      // --------------------------------------------------
      if (isGrouped && name) {
        const group = Array.from(
          document.querySelectorAll(
            `input[type="${type}"][name="${CSS.escape(name)}"]`
          )
        );

        // Get the parent/question container
        const container = element.closest(
          ".application-question, .question, .field"
        );

        if (container) {
          const labelElements = Array.from(
            container.querySelectorAll("label")
          );

          // Find a label that is NOT one of the option labels.
          // Lever's question heading is generally the first relevant
          // label before the actual radio/checkbox options.
          if (labelElements.length > group.length) {
            label = labelElements[0].innerText.trim();
          }
        }

        // If that didn't work, look for a heading/legend
        if (!label && container) {
          const heading = container.querySelector(
            "legend, h1, h2, h3, h4, h5, h6"
          );

          if (heading) {
            label = heading.innerText.trim();
          }
        }

        // Final fallback: use the first option label
        if (!label && group.length > 0) {
          const firstInput = group[0];

          if (firstInput.id) {
            const optionLabel = document.querySelector(
              `label[for="${CSS.escape(firstInput.id)}"]`
            );

            if (optionLabel) {
              label = optionLabel.innerText.trim();
            }
          }

          if (!label) {
            label = firstInput.value;
          }
        }

        // Extract all options
        const options = group.map((input) => {
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

      // --------------------------------------------------
      // 3. Normal inputs / textarea
      // --------------------------------------------------

      // Find label associated through "for"
      if (element.id) {
        const labelElement = document.querySelector(
          `label[for="${CSS.escape(element.id)}"]`
        );

        if (labelElement) {
          label = labelElement.innerText.trim();
        }
      }

      // Look for surrounding question container
      if (!label) {
        const container = element.closest(
          ".application-question, .question, .field"
        );

        if (container) {
          const labelElement = container.querySelector("label");

          if (labelElement) {
            label = labelElement.innerText.trim();
          }
        }
      }

      // Fallback to name
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
      });
    }

    return result;
  });

  return fields;
}

async fillField(field, value) {
  if (value === undefined || value === null) {
    throw new Error(`No value provided for field: ${field.name}`);
  }

  console.log(`Filling ${field.name} → ${value}`);

  let locator;

  if (field.id) {
    locator = this.page.locator(`#${field.id}`);
  } else if (field.name) {
    locator = this.page.locator(`[name="${field.name}"]`);
  } else {
    throw new Error(`Cannot locate field: ${field.name}`);
  }

  if (field.type === "select") {
    await locator.selectOption({ label: value });
    return;
  }

  if (field.type === "radio") {
    await locator
      .locator(`xpath=..`)
      .getByText(value, { exact: true })
      .click();
    return;
  }

  if (field.type === "checkbox") {
    await locator
      .locator(`xpath=..`)
      .getByText(value, { exact: true })
      .click();
    return;
  }

  await locator.fill(value);
}

async uploadResume(filePath) {
  if (!filePath) {
    throw new Error("Resume file path is required");
  }

  const resumeInput = this.page.locator("#resume-upload-input");

  await resumeInput.setInputFiles(filePath);

  console.log(`✅ Resume uploaded: ${filePath}`);
}

  async submit() {
    throw new Error("Not implemented yet");
  }
}