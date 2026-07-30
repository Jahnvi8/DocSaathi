import { config } from "../config.js";
import { runRetrieval, type RetrievalResult } from "./retrieval/pipeline.js";
import type { ScoredChunk } from "./store.js";

/**
 * The "R" in RAG. Thin wrapper over the retrieval pipeline (Track A) using the
 * app's default config. The pipeline does hybrid search + optional query
 * rewriting + optional reranking; see rag/retrieval/pipeline.ts.
 */
export async function retrieve(question: string, docId?: string): Promise<ScoredChunk[]> {
  const { scored } = await runRetrieval(question, config.retrieval, docId);
  return scored;
}

/**
 * Same as retrieve(), but also returns the trace of which stages ran. Pass a
 * `docId` to scope retrieval to a single selected document.
 */
export function retrieveWithTrace(question: string, docId?: string): Promise<RetrievalResult> {
  return runRetrieval(question, config.retrieval, docId);
}
