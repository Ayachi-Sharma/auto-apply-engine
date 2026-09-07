import { BaseAdapter } from "./baseAdapter.js";

/**
 * GreenhouseAdapter — stub implementation.
 * Full automation is not yet implemented. The engine will fail gracefully
 * with a clear error rather than crashing.
 */
export class GreenhouseAdapter extends BaseAdapter {
  async openApplication(jobUrl) {
    throw new Error(
      "Greenhouse adapter is not yet implemented. Job URL: " + jobUrl
    );
  }

  async getFields() {
    throw new Error("Greenhouse adapter is not yet implemented.");
  }

  async fillField(_field, _value) {
    throw new Error("Greenhouse adapter is not yet implemented.");
  }

  async uploadResume(_filePath) {
    throw new Error("Greenhouse adapter is not yet implemented.");
  }

  async submit() {
    throw new Error("Greenhouse adapter is not yet implemented.");
  }
}
