import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      required: true,
    },

    label: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      required: true,
    },

    options: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { _id: false }
);

const applicationRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    jobUrl: {
      type: String,
      required: true,
    },

    profile: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    },

    ats: {
      type: String,
      required: true,
      enum: ["lever", "greenhouse", "ashby", "workable"],
    },

    status: {
      type: String,
      required: true,
      enum: ["RUNNING", "NEEDS_INPUT", "FILLED", "SUBMITTED", "FAILED"],
      default: "RUNNING",
    },

    fields: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    missingFields: {
      type: [questionSchema],
      default: [],
    },

    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    receipt: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    confirmationText: {
      type: String,
      default: null,
    },

    failure: {
      reason: {
        type: String,
        default: null,
      },

      step: {
        type: String,
        default: null,
      },

      screenshot: {
        type: String,
        default: null,
      },
    },

    resumePath: {
      type: String,
      default: null,
    },

    trace: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    recordingPath: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const ApplicationRun = mongoose.model(
  "ApplicationRun",
  applicationRunSchema
);