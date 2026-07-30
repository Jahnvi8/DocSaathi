import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { config, hasApiKey } from "./config.js";
import uploadRouter from "./routes/upload.js";
import documentsRouter from "./routes/documents.js";
import chatRouter from "./routes/chat.js";

const app = express();

// Middleware. JSON body parsing for the chat endpoint; CORS is a safety net
// (the Vite dev proxy means the browser is same-origin, but this keeps curl /
// alternate setups working).
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check — handy for "is the server up?" and for the frontend to detect
// whether a Gemini key is configured.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasApiKey: hasApiKey() });
});

// Routes.
app.use("/api/upload", uploadRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/chat", chatRouter);

// Central error handler. Any error thrown in a route (or passed to next(err))
// lands here and returns a clean JSON message instead of crashing the process.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  console.error("[error]", message);
  res.status(500).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`\n🟢 DocSaathi API listening on http://localhost:${config.port}`);
  if (!hasApiKey()) {
    console.warn(
      "⚠️  GEMINI_API_KEY is not set. Uploads and chat will fail until you add it.\n" +
        "   → Copy .env.example to .env and paste a key from https://aistudio.google.com/app/apikey\n"
    );
  }
});
