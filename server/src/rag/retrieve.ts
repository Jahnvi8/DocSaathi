import { config } from "../config.js";
import { runRetrieval, type RetrievalResult } from "./retrieval/pipeline.js";
import type { ScoredChunk } from "./store.js";

/**
 * The "R" in RAG. Thin wrapper over the retrieval pipeline (Track A) using the
 * app's default config. The pipeline does hybrid search + optional query
 * rewriting + optional reranking; see rag/retrieval/pipeline.ts.
 */
export async function retrieve(question: string): Promise<ScoredChunk[]> {
  const { scored } = await runRetrieval(question, config.retrieval);
  return scored;
}

/** Same as retrieve(), but also returns the trace of which stages ran. */
export function retrieveWithTrace(question: string): Promise<RetrievalResult> {
  return runRetrieval(question, config.retrieval);
}
