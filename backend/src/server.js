import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDatabase } from "./config/database.js";
import applicationRoutes from "./routes/applicationRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Allow the Vite dev server and any localhost origin
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// Health check
app.get("/", (_req, res) => res.json({ message: "Auto Apply Engine API is running" }));

// Application routes
app.use("/api", applicationRoutes);

await connectDatabase();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
