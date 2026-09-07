import { BaseAdapter } from "./baseAdapter.js";

/**
 * WorkableAdapter — stub implementation.
 */
export class WorkableAdapter extends BaseAdapter {
  async openApplication(jobUrl) {
    throw new Error(
      "Workable adapter is not yet implemented. Job URL: " + jobUrl
    );
  }

  async getFields() {
    throw new Error("Workable adapter is not yet implemented.");
  }

  async fillField(_field, _value) {
    throw new Error("Workable adapter is not yet implemented.");
  }

  async uploadResume(_filePath) {
    throw new Error("Workable adapter is not yet implemented.");
  }

  async submit() {
    throw new Error("Workable adapter is not yet implemented.");
  }
}
