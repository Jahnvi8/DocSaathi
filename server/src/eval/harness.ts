import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertApiKey } from "../config.js";
import type { RawChunk } from "../rag/chunk.js";
import { embedChunks } from "../rag/embed.js";
import { addDocument, isEmpty } from "../rag/store.js";
import { runRetrieval, type RetrievalConfig } from "../rag/retrieval/pipeline.js";
import { generateAnswer } from "../llm/gemini.js";
import { contextRecall, contextPrecision, judgeAnswer } from "./metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DatasetItem {
  id: string;
  question: string;
  relevantText: string[];
  expectedAnswerPoints: string[];
}
interface Dataset {
  document: string;
  items: DatasetItem[];
}

// The configs we compare. Each disables/enables one more retrieval stage than
// the last, so the scorecard reads as an ablation study: how much does each
// technique add?
const CONFIGS: { name: string; cfg: RetrievalConfig }[] = [
  { name: "baseline (vector-only)", cfg: c(false, false, false) },
  { name: "hybrid (vector+BM25)", cfg: c(true, false, false) },
  { name: "hybrid + rerank", cfg: c(true, false, true) },
  { name: "hybrid + rewrite + rerank", cfg: c(true, true, true) },
];

function c(hybrid: boolean, queryRewrite: boolean, rerank: boolean): RetrievalConfig {
  // EVAL_TOPK lets us tighten retrieval; smaller topK makes ranking quality
  // (and thus the value of hybrid/rerank) show up in the metrics.
  const topK = Number(process.env.EVAL_TOPK) || 3;
  return { hybrid, queryRewrite, rerank, topK, candidateK: 12 };
}

/**
 * For the benchmark we chunk the handbook at SECTION granularity (one chunk per
 * paragraph block) rather than the app's larger fixed-size chunks. This yields
 * ~10 single-topic chunks so that retrieving topK=3 is genuinely selective —
 * otherwise a small doc collapses to a few chunks and every config trivially
 * retrieves everything (recall 100% for all, nothing to compare).
 */
function splitIntoSections(text: string): RawChunk[] {
  return text
    .split(/\n\s*\n/) // blank-line separated blocks
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((section, i) => ({ text: section, page: null, chunkIndex: i }));
}

interface Agg {
  recall: number;
  precision: number;
  faithfulness: number;
  answerRelevance: number;
  n: number;
}

export async function main(): Promise<void> {
  assertApiKey();

  // Knobs to keep quota in check (free tier). Defaults are modest.
  //   EVAL_QUESTIONS — how many golden questions to run (default 4).
  //   EVAL_JUDGE=false — skip the LLM-judged metrics (uses generation quota).
  //   EVAL_CONFIGS=N — run only the first N configs. Configs 1-2 (baseline,
  //     hybrid) use ONLY embeddings; configs with rerank/rewrite need generation.
  const maxQuestions = Number(process.env.EVAL_QUESTIONS) || 4;
  const judge = process.env.EVAL_JUDGE !== "false"; // LLM-judged metrics on by default
  const maxConfigs = Number(process.env.EVAL_CONFIGS) || CONFIGS.length;
  const configs = CONFIGS.slice(0, maxConfigs);

  // 1) Load dataset + ingest its document into the (isolated) eval store.
  const dataset = JSON.parse(
    fs.readFileSync(path.join(__dirname, "dataset.json"), "utf-8")
  ) as Dataset;
  const items = dataset.items.slice(0, maxQuestions);

  if (isEmpty()) {
    const docText = fs.readFileSync(path.join(__dirname, "docs", dataset.document), "utf-8");
    const chunks = splitIntoSections(docText);
    console.log(`Ingesting "${dataset.document}" → ${chunks.length} chunks…`);
    const embeddings = await embedChunks(chunks.map((ch) => ch.text));
    addDocument(dataset.document, "eval-doc", chunks, embeddings);
  }

  console.log(
    `\nRunning eval: ${items.length} questions × ${CONFIGS.length} configs` +
      `${judge ? " (with LLM-judged metrics)" : " (retrieval metrics only)"}.\n`
  );

  // 2) Run each config over each question, accumulating metrics.
  const results: { name: string; agg: Agg }[] = [];
  for (const { name, cfg } of configs) {
    const agg: Agg = { recall: 0, precision: 0, faithfulness: 0, answerRelevance: 0, n: 0 };
    process.stdout.write(`• ${name} `);

    for (const item of items) {
      const { scored } = await runRetrieval(item.question, cfg);

      agg.recall += contextRecall(item.relevantText, scored);
      agg.precision += contextPrecision(item.relevantText, scored);

      if (judge) {
        const answer = await generateAnswer(item.question, scored);
        const { faithfulness, answerRelevance } = await judgeAnswer(item.question, answer, scored);
        agg.faithfulness += faithfulness;
        agg.answerRelevance += answerRelevance;
      }
      agg.n += 1;
      process.stdout.write(".");
    }
    process.stdout.write(" done\n");
    results.push({ name, agg });
  }

  // 3) Print the scorecard.
  printScorecard(results, judge);
}

function printScorecard(results: { name: string; agg: Agg }[], judge: boolean): void {
  const pct = (v: number, n: number) => (n ? ((v / n) * 100).toFixed(1).padStart(5) : "  n/a");

  const cols = judge
    ? ["Context Recall", "Context Prec.", "Faithfulness", "Answer Rel."]
    : ["Context Recall", "Context Prec."];
  const nameWidth = Math.max(...results.map((r) => r.name.length), "Config".length);

  console.log("\n" + "═".repeat(nameWidth + cols.length * 16 + 4));
  console.log("  RETRIEVAL EVALUATION SCORECARD  (higher is better, %)");
  console.log("═".repeat(nameWidth + cols.length * 16 + 4));
  console.log(
    "  " + "Config".padEnd(nameWidth) + "  " + cols.map((h) => h.padStart(14)).join("  ")
  );
  console.log("  " + "-".repeat(nameWidth) + "  " + cols.map(() => "-".repeat(14)).join("  "));

  for (const { name, agg } of results) {
    const row = judge
      ? [
          pct(agg.recall, agg.n),
          pct(agg.precision, agg.n),
          pct(agg.faithfulness, agg.n),
          pct(agg.answerRelevance, agg.n),
        ]
      : [pct(agg.recall, agg.n), pct(agg.precision, agg.n)];
    console.log("  " + name.padEnd(nameWidth) + "  " + row.map((v) => v.padStart(14)).join("  "));
  }
  console.log("═".repeat(nameWidth + cols.length * 16 + 4) + "\n");
}
