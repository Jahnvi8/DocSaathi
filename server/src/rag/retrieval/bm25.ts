import type { StoredChunk } from "../store.js";
import { getAllChunks, getStoreVersion } from "../store.js";
import type { RankedId } from "./types.js";

// ── BM25 keyword search (hand-written) ──────────────────────────────────────
//
// Vector search matches *meaning* but can miss exact keywords, rare terms, IDs,
// or names. BM25 is the classic lexical ranking function — it rewards documents
// where the query's terms appear often (term frequency), discounts terms that
// appear everywhere (inverse document frequency), and normalizes for document
// length so long chunks don't win by default. Combining BM25 with vectors
// ("hybrid search") is a standard, strong retrieval baseline.
//
// Scoring formula for a query term t in document d:
//   idf(t) * ( f(t,d) * (k1 + 1) ) / ( f(t,d) + k1 * (1 - b + b * |d|/avgdl) )
// where k1 controls TF saturation and b controls length normalization.

const K1 = 1.5;
const B = 0.75;

/** Split text into lowercase word/number tokens (Unicode-aware → handles Hindi). */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

interface IndexedDoc {
  id: string;
  length: number;
  termFreq: Map<string, number>;
}

interface Bm25Index {
  version: number;
  docs: IndexedDoc[];
  idf: Map<string, number>;
  avgDocLength: number;
}

let cached: Bm25Index | null = null;

function build(chunks: StoredChunk[], version: number): Bm25Index {
  const docs: IndexedDoc[] = chunks.map((c) => {
    // Include the optional context blurb (contextual retrieval) in the keyword text.
    const tokens = tokenize((c.context ? `${c.context} ` : "") + c.text);
    const termFreq = new Map<string, number>();
    for (const term of tokens) termFreq.set(term, (termFreq.get(term) ?? 0) + 1);
    return { id: c.id, length: tokens.length, termFreq };
  });

  // Document frequency: in how many docs does each term appear?
  const docFreq = new Map<string, number>();
  for (const doc of docs) {
    for (const term of doc.termFreq.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const N = docs.length;
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq) {
    // Smoothed IDF (BM25 variant): rarer terms → higher weight.
    idf.set(term, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }

  const totalLength = docs.reduce((sum, d) => sum + d.length, 0);
  const avgDocLength = N > 0 ? totalLength / N : 0;

  return { version, docs, idf, avgDocLength };
}

/** Return the cached index, rebuilding only when the store has changed. */
function getIndex(): Bm25Index {
  const version = getStoreVersion();
  if (!cached || cached.version !== version) {
    cached = build(getAllChunks(), version);
  }
  return cached;
}

/** Rank chunks by BM25 score for the query. Returns up to `limit` scored ids. */
export function bm25Search(query: string, limit: number): RankedId[] {
  const index = getIndex();
  const queryTerms = tokenize(query);

  const results: RankedId[] = index.docs.map((doc) => {
    let score = 0;
    for (const term of queryTerms) {
      const freq = doc.termFreq.get(term);
      if (!freq) continue;
      const idf = index.idf.get(term) ?? 0;
      const numerator = freq * (K1 + 1);
      const denominator = freq + K1 * (1 - B + B * (doc.length / (index.avgDocLength || 1)));
      score += idf * (numerator / denominator);
    }
    return { id: doc.id, score };
  });

  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
