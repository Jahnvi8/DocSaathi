import type { ScoredChunk } from "../store.js";
import { generateJson } from "../../llm/gemini.js";

// ── LLM reranking ───────────────────────────────────────────────────────────
//
// Retrieval (vector + BM25) is fast but shallow: it scores each passage in
// isolation and can't reason about whether a passage truly *answers* the
// question. So we deliberately retrieve a WIDE net (candidateK ≈ 20), then ask
// the LLM to read all candidates together and score each for actual relevance —
// a "listwise" rerank. We keep the top-k by that judgment. This is the classic
// retrieve-wide-then-rerank-narrow pattern, and it's usually the single biggest
// precision win in a RAG pipeline.

const SYSTEM = `You are a relevance judge for a document Q&A system.
Given a question and a list of numbered passages, rate how well EACH passage helps answer the question.
Score 0 (irrelevant) to 10 (directly answers the question).
Respond ONLY as JSON: {"scores": [{"index": <number>, "score": <0-10>}, ...]} covering every passage index.`;

const SNIPPET_CHARS = 500;

export async function rerankChunks(
  question: string,
  candidates: ScoredChunk[],
  topK: number
): Promise<ScoredChunk[]> {
  // Nothing to reorder meaningfully — skip the LLM call (saves quota).
  if (candidates.length <= 1) return candidates.slice(0, topK);

  try {
    const passages = candidates
      .map((c, i) => `[${i}] ${c.chunk.text.slice(0, SNIPPET_CHARS).replace(/\s+/g, " ")}`)
      .join("\n\n");

    const result = await generateJson<{ scores?: { index: number; score: number }[] }>(
      `Question: ${question}\n\nPassages:\n${passages}`,
      { system: SYSTEM, retries: 2 }
    );

    const scoreByIndex = new Map<number, number>();
    if (Array.isArray(result.scores)) {
      for (const s of result.scores) {
        if (typeof s?.index === "number" && typeof s?.score === "number") {
          scoreByIndex.set(s.index, s.score);
        }
      }
    }

    // Reorder by the model's relevance score (unscored → sink to the bottom).
    return candidates
      .map((c, i) => ({ chunk: c.chunk, score: scoreByIndex.get(i) ?? -1 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (err) {
    // Reranking is an enhancement — on failure, fall back to fusion order.
    console.warn("[rerank] failed, keeping fusion order:", (err as Error).message);
    return candidates.slice(0, topK);
  }
}
