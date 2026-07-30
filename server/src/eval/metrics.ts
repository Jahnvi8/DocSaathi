import type { ScoredChunk } from "../rag/store.js";
import { generateJson } from "../llm/gemini.js";

// ── Evaluation metrics (RAGAS-inspired) ─────────────────────────────────────
//
// We split metrics into two kinds:
//
//  1) OBJECTIVE retrieval metrics (no LLM) — computed by checking whether the
//     dataset's known-relevant text actually appears in the retrieved chunks.
//     These directly measure Track A: did retrieval find the right passages?
//
//  2) LLM-JUDGED generation metrics — faithfulness and answer relevance, scored
//     by asking the model to grade the generated answer. These measure the end
//     result the user sees.

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

/** Does any retrieved chunk contain this expected substring? */
function isFound(needle: string, chunks: ScoredChunk[]): boolean {
  const target = normalize(needle);
  return chunks.some((c) => normalize(c.chunk.text).includes(target));
}

/**
 * Context Recall — of the passages we KNOW are relevant (dataset.relevantText),
 * what fraction did retrieval actually surface? High recall = "we found the
 * evidence needed to answer."
 */
export function contextRecall(relevantText: string[], retrieved: ScoredChunk[]): number {
  if (relevantText.length === 0) return 1;
  const found = relevantText.filter((t) => isFound(t, retrieved)).length;
  return found / relevantText.length;
}

/**
 * Context Precision — of the chunks we retrieved, what fraction are actually
 * relevant (contain at least one expected substring)? High precision = "we
 * didn't pad the context with junk," which keeps the LLM focused and cheap.
 */
export function contextPrecision(relevantText: string[], retrieved: ScoredChunk[]): number {
  if (retrieved.length === 0) return 0;
  const relevantCount = retrieved.filter((c) =>
    relevantText.some((t) => normalize(c.chunk.text).includes(normalize(t)))
  ).length;
  return relevantCount / retrieved.length;
}

export interface JudgeScores {
  /** Is the answer grounded in the retrieved context (no hallucination)? 0..1 */
  faithfulness: number;
  /** Does the answer actually address the question? 0..1 */
  answerRelevance: number;
}

/**
 * LLM-as-judge for both generation metrics in ONE call (halves quota use vs.
 * judging each separately). Faithfulness checks grounding against the context;
 * answer relevance checks whether the question was actually addressed.
 */
export async function judgeAnswer(
  question: string,
  answer: string,
  retrieved: ScoredChunk[]
): Promise<JudgeScores> {
  const context = retrieved.map((c, i) => `[${i + 1}] ${c.chunk.text}`).join("\n\n");
  const result = await generateJson<{ faithfulness?: number; answerRelevance?: number }>(
    `Question:\n${question}\n\nContext:\n${context}\n\nAnswer:\n${answer}\n\n` +
      `Grade two things, each 0..1:\n` +
      `- faithfulness: how well every claim in the Answer is supported by the Context (1.0 = fully grounded, 0.0 = contradicts/invents).\n` +
      `- answerRelevance: how directly the Answer addresses the Question (1.0 = fully answers, 0.0 = off-topic/non-answer).`,
    {
      system:
        'You are a strict RAG grader. Respond ONLY as JSON: {"faithfulness": <0..1>, "answerRelevance": <0..1>}.',
      retries: 2,
    }
  );
  return {
    faithfulness: clamp01(result.faithfulness),
    answerRelevance: clamp01(result.answerRelevance),
  };
}

function clamp01(n: unknown): number {
  const value = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, value));
}
