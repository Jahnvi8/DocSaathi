import { generateJson } from "../../llm/gemini.js";

// ── Query rewriting / multi-query expansion ─────────────────────────────────
//
// The user's raw question is often a poor *search* query: it can be chatty
// ("hey can you tell me..."), vague, or — in this app — written in Hinglish or
// Hindi while the document is in English. We ask the LLM to produce a few
// focused search-query variants. Each variant is retrieved separately and the
// results are fused (RRF), which widens recall: different phrasings surface
// different relevant chunks. The original question is always kept as one query.

const SYSTEM = `You rewrite a user's question into effective search queries for a document retrieval system.
Return 2-3 alternative queries that maximize the chance of retrieving relevant passages.
Guidelines:
- Make them concise and keyword-focused (drop chit-chat, keep the key terms).
- If the question is in Hindi or Hinglish, ALSO include at least one English variant (documents are often in English).
- Cover slightly different phrasings/synonyms, not near-duplicates.
Respond ONLY as JSON: {"queries": ["...", "..."]}`;

const MAX_QUERIES = 4;

export async function rewriteQuery(question: string): Promise<string[]> {
  try {
    const result = await generateJson<{ queries?: unknown }>(
      `Question: ${question}`,
      { system: SYSTEM, retries: 2 }
    );

    const variants = Array.isArray(result.queries)
      ? result.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      : [];

    // Always include the original question, dedupe case-insensitively, and cap.
    const seen = new Set<string>();
    const queries: string[] = [];
    for (const q of [question, ...variants]) {
      const key = q.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        queries.push(q.trim());
      }
    }
    return queries.slice(0, MAX_QUERIES);
  } catch (err) {
    // Never let rewriting break retrieval — fall back to the raw question.
    console.warn("[queryRewrite] failed, using original question:", (err as Error).message);
    return [question];
  }
}
