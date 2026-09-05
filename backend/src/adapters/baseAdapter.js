export class BaseAdapter {
  constructor(page) {
    this.page = page;
  }

  async openApplication(jobUrl) {
    throw new Error("openApplication() must be implemented");
  }

  async getFields() {
    throw new Error("getFields() must be implemented");
  }

  async fillField(field, value) {
    throw new Error("fillField() must be implemented");
  }

  async uploadResume(filePath) {
    throw new Error("uploadResume() must be implemented");
  }

  async submit() {
    throw new Error("submit() must be implemented");
  }
}