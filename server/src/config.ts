import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

// The .env file lives in the PROJECT ROOT (one level above /server), so all
// three workspaces share one set of secrets. Resolve it relative to this file
// so it works no matter what directory the process is launched from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");
dotenv.config({ path: rootEnvPath });

/** Read a boolean env var, treating true/1/yes as true; falls back to a default. */
function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

const topK = Number(process.env.RAG_TOP_K) || 4;

export const config = {
  port: Number(process.env.PORT) || 3001,
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
  chatModel: process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-flash-latest",
  embedModel: process.env.GEMINI_EMBED_MODEL?.trim() || "gemini-embedding-001",
  topK,
  // Retrieval pipeline toggles (Track A). Defaults are the "best" config; the
  // eval harness overrides these to measure each stage's contribution.
  retrieval: {
    // Hybrid is free (BM25 is local, no API cost) so it's on by default.
    hybrid: envBool("RAG_HYBRID", true),
    // Rewrite & rerank each add a generation call per question. The free tier is
    // only ~20 generation requests/day, so they're OFF by default to keep the
    // live app usable; turn them on for higher quality (or in the eval harness).
    queryRewrite: envBool("RAG_QUERY_REWRITE", false),
    rerank: envBool("RAG_RERANK", false),
    contextual: envBool("RAG_CONTEXTUAL", false), // ingest-time; off by default (quota cost)
    topK,
    candidateK: Number(process.env.RAG_CANDIDATE_K) || 20,
  },
  // Where the persisted vector store lives (survives server restarts).
  // STORE_PATH lets the eval harness point at an isolated store so it never
  // touches the app's real data.
  storePath:
    process.env.STORE_PATH?.trim() || path.resolve(__dirname, "..", "data", "store.json"),
};

/** True only when a non-empty API key is present. */
export function hasApiKey(): boolean {
  return config.geminiApiKey.length > 0;
}

/**
 * Throw a clear, actionable error when the key is missing. Called by any route
 * that needs to talk to Gemini, so the user gets a helpful message instead of
 * a cryptic SDK crash.
 */
export function assertApiKey(): void {
  if (!hasApiKey()) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy .env.example to .env in the project root " +
        "and add a key from https://aistudio.google.com/app/apikey"
    );
  }
}
