import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import type { RawChunk } from "./chunk.js";

// ── Data shapes ──────────────────────────────────────────────────────────────

/** A fully-indexed chunk: text + metadata + its embedding vector. */
export interface StoredChunk extends RawChunk {
  id: string; // e.g. "report.pdf-1700000000000#3"
  docId: string; // groups all chunks from one upload
  source: string; // original file name
  embedding: number[];
  /** Optional one-line context blurb prepended before embedding (contextual retrieval). */
  context?: string;
}

/** A chunk without its (large) embedding — safe to send to the client. */
export type PublicChunk = Omit<StoredChunk, "embedding">;

/** A citation sent to the client alongside an answer (mirrors client/src/types.ts). */
export interface Citation {
  id: string;
  docId: string;
  source: string;
  page: number | null;
  snippet: string;
}

interface StoreFile {
  version: 1;
  chunks: StoredChunk[];
}

// ── In-memory state, lazily loaded from disk ────────────────────────────────

let chunks: StoredChunk[] | null = null;
// Bumped whenever the chunk set changes, so derived indexes (e.g. BM25) know to
// rebuild instead of recomputing on every query.
let version = 0;

function load(): StoredChunk[] {
  if (chunks) return chunks;
  try {
    if (fs.existsSync(config.storePath)) {
      const parsed = JSON.parse(fs.readFileSync(config.storePath, "utf-8")) as StoreFile;
      chunks = parsed.chunks ?? [];
    } else {
      chunks = [];
    }
  } catch (err) {
    console.error("[store] Failed to read store.json, starting empty:", err);
    chunks = [];
  }
  return chunks;
}

function persist(): void {
  const data: StoreFile = { version: 1, chunks: load() };
  fs.mkdirSync(path.dirname(config.storePath), { recursive: true });
  // No pretty-printing: embedding arrays are large, compact JSON keeps the file small.
  fs.writeFileSync(config.storePath, JSON.stringify(data));
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Add one document's worth of chunks (with embeddings) and persist. */
export function addDocument(
  source: string,
  docId: string,
  raw: RawChunk[],
  embeddings: number[][],
  contexts?: string[]
): StoredChunk[] {
  const all = load();
  const added: StoredChunk[] = raw.map((c, i) => ({
    ...c,
    id: `${docId}#${c.chunkIndex}`,
    docId,
    source,
    embedding: embeddings[i],
    ...(contexts?.[i] ? { context: contexts[i] } : {}),
  }));
  all.push(...added);
  version += 1; // invalidate derived indexes (BM25)
  persist();
  return added;
}

export function isEmpty(): boolean {
  return load().length === 0;
}

/** Remove all chunks for a document and persist. Returns how many were removed. */
export function deleteDocument(docId: string): number {
  const all = load();
  const kept = all.filter((c) => c.docId !== docId);
  const removed = all.length - kept.length;
  if (removed > 0) {
    chunks = kept; // replace the in-memory cache
    version += 1; // invalidate derived indexes (BM25)
    persist();
  }
  return removed;
}

/** All indexed chunks (with embeddings). Used to build the BM25 keyword index. */
export function getAllChunks(): StoredChunk[] {
  return load();
}

/** Monotonic version that changes whenever the chunk set changes. */
export function getStoreVersion(): number {
  return version;
}

/** Look up chunks by id, preserving the input order (used after rank fusion). */
export function getChunksByIds(ids: string[]): StoredChunk[] {
  const byId = new Map(load().map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is StoredChunk => c != null);
}

/** List indexed documents (derived from chunks), most-recent first. */
export function listDocuments(): { docId: string; source: string; chunkCount: number }[] {
  const byDoc = new Map<string, { docId: string; source: string; chunkCount: number }>();
  for (const c of load()) {
    const existing = byDoc.get(c.docId);
    if (existing) existing.chunkCount += 1;
    else byDoc.set(c.docId, { docId: c.docId, source: c.source, chunkCount: 1 });
  }
  // Insertion order of the Map roughly follows upload order; reverse for recent-first.
  return [...byDoc.values()].reverse();
}

/** All chunks for a document, without embeddings — used by the document viewer. */
export function getDocumentChunks(docId: string): PublicChunk[] {
  return load()
    .filter((c) => c.docId === docId)
    .map(stripEmbedding);
}

export function stripEmbedding(c: StoredChunk): PublicChunk {
  const { embedding, ...rest } = c;
  void embedding;
  return rest;
}

// ── Similarity search ───────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors. Range roughly [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface ScoredChunk {
  chunk: StoredChunk;
  score: number;
}

/**
 * Return the top-k chunks most similar to the query embedding. If `docId` is
 * given, search is scoped to just that document.
 */
export function search(queryEmbedding: number[], topK: number, docId?: string): ScoredChunk[] {
  const pool = docId ? load().filter((c) => c.docId === docId) : load();
  return pool
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
