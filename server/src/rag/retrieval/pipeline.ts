import { config } from "../../config.js";
import { embedQuery } from "../embed.js";
import { search, getChunksByIds, type ScoredChunk } from "../store.js";
import { bm25Search } from "./bm25.js";
import { reciprocalRankFusion } from "./rrf.js";
import { rewriteQuery } from "./queryRewrite.js";
import { rerankChunks } from "./rerank.js";
import type { RankedId } from "./types.js";

/** Toggleable retrieval stages. The eval harness flips these to measure impact. */
export interface RetrievalConfig {
  hybrid: boolean; // BM25 + vector fused with RRF (vs vector-only)
  queryRewrite: boolean; // LLM expands the question into search variants
  rerank: boolean; // LLM reorders the candidate pool
  topK: number; // final chunks returned
  candidateK: number; // how many to retrieve before reranking
}

/** What actually ran — surfaced for debugging, demos, and the UI. */
export interface RetrievalTrace {
  stages: string[];
  queries: string[];
  candidateCount: number;
}

export interface RetrievalResult {
  scored: ScoredChunk[];
  trace: RetrievalTrace;
}

/**
 * The retrieval pipeline — the heart of Track A.
 *
 *   question
 *     → (optional) query rewrite → N search queries
 *     → per query: vector search  ⊕  BM25 search  → RRF fuse
 *     → fuse across queries
 *     → (optional) LLM rerank the candidate pool
 *     → top-k
 *
 * Every stage is a toggle, so we can A/B each one in the eval harness and prove
 * its contribution with numbers rather than vibes.
 */
export async function runRetrieval(
  question: string,
  cfg: RetrievalConfig = config.retrieval
): Promise<RetrievalResult> {
  const stages: string[] = [];

  // 1) Query rewriting → one or more search queries.
  let queries = [question];
  if (cfg.queryRewrite) {
    queries = await rewriteQuery(question);
    stages.push("query-rewrite");
  }

  // 2) Retrieve candidates for each query (vector, optionally fused with BM25).
  const perQueryLists: RankedId[][] = [];
  for (const q of queries) {
    const queryEmbedding = await embedQuery(q);
    const vectorList: RankedId[] = search(queryEmbedding, cfg.candidateK).map((s) => ({
      id: s.chunk.id,
      score: s.score,
    }));

    if (cfg.hybrid) {
      const keywordList = bm25Search(q, cfg.candidateK);
      perQueryLists.push(reciprocalRankFusion([vectorList, keywordList], cfg.candidateK));
    } else {
      perQueryLists.push(vectorList);
    }
  }
  stages.push(cfg.hybrid ? "hybrid(vector+bm25+rrf)" : "vector");

  // 3) Fuse across query variants (if we rewrote into several).
  const fused =
    perQueryLists.length === 1
      ? perQueryLists[0]
      : reciprocalRankFusion(perQueryLists, cfg.candidateK);

  // Resolve ids → chunk objects, carrying each fused score across by id.
  const scoreById = new Map(fused.map((r) => [r.id, r.score]));
  let candidates: ScoredChunk[] = getChunksByIds(fused.map((r) => r.id)).map((chunk) => ({
    chunk,
    score: scoreById.get(chunk.id) ?? 0,
  }));

  // 4) Rerank the candidate pool down to the final top-k.
  if (cfg.rerank) {
    candidates = await rerankChunks(question, candidates, cfg.topK);
    stages.push("rerank");
  }

  const scored = candidates.slice(0, cfg.topK);
  return { scored, trace: { stages, queries, candidateCount: fused.length } };
}
