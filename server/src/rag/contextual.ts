import { generateJson } from "../llm/gemini.js";

// ── Contextual retrieval (Anthropic's technique) ────────────────────────────
//
// A chunk taken out of its document loses context: "It grew 20%" — what grew?
// Contextual retrieval fixes this by asking the LLM, for each chunk, to write a
// short blurb situating it within the whole document ("This chunk is from the
// revenue section and discusses Q3 sales growth"). We PREPEND that blurb before
// embedding (and index it for BM25 too), which measurably improves retrieval
// recall on ambiguous chunks.
//
// Cost: one LLM call per chunk at ingest time. That's why it's gated behind
// RAG_CONTEXTUAL (off by default) — on a tight free-tier quota it adds up fast.

const SYSTEM = `You situate a chunk within its source document to improve search retrieval.
Given the document and one chunk from it, write a SHORT standalone context (max 25 words) describing what the chunk is about and where it fits in the document.
Do not add information not present. Respond ONLY as JSON: {"context": "..."}.`;

const MAX_DOC_CHARS = 8000;
const MAX_CHUNK_CHARS = 1500;

/**
 * Return a context blurb for each chunk (aligned by index). Runs sequentially to
 * stay friendly to rate limits; a failure for one chunk yields "" (no context).
 */
export async function generateChunkContexts(
  fullText: string,
  chunkTexts: string[]
): Promise<string[]> {
  const doc = fullText.slice(0, MAX_DOC_CHARS);
  const contexts: string[] = [];

  for (const chunk of chunkTexts) {
    try {
      const result = await generateJson<{ context?: string }>(
        `<document>\n${doc}\n</document>\n\n<chunk>\n${chunk.slice(0, MAX_CHUNK_CHARS)}\n</chunk>`,
        { system: SYSTEM, retries: 2 }
      );
      contexts.push(typeof result.context === "string" ? result.context.trim() : "");
    } catch (err) {
      console.warn("[contextual] failed for a chunk:", (err as Error).message);
      contexts.push("");
    }
  }

  return contexts;
}
