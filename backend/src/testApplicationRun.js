import mongoose from "mongoose";
import { ApplicationRun } from "./models/applicationRun.js";

console.log("ApplicationRun model loaded:", ApplicationRun.modelName);

await mongoose.disconnect();

console.log("✅ ApplicationRun model test passed");