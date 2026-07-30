import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Bootstrap for the eval harness.
//
// We point the vector store at an ISOLATED file (eval-store.json) BEFORE any app
// module loads config, so evaluation never reads or writes the app's real data.
// Because config.ts reads STORE_PATH at import time, we set the env var here and
// then DYNAMICALLY import the harness (whose imports resolve config afterward).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evalStorePath = path.resolve(__dirname, "..", "..", "data", "eval-store.json");
process.env.STORE_PATH = evalStorePath;

// Start each run from a clean slate so ingestion is reproducible.
if (fs.existsSync(evalStorePath)) fs.rmSync(evalStorePath);

const { main } = await import("./harness.js");
await main().catch((err) => {
  console.error("\n[eval] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
