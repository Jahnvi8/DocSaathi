// Shared types that mirror the server's contract (see server/src/rag/store.ts).
// Keeping these in one place makes the client/server data shapes easy to reason
// about — the "API contract" of the app.

/** A citation the model used to answer — sent to the client without the raw embedding. */
export interface Citation {
  id: string; // chunk id, e.g. "mydoc-1700000000000#3"
  docId: string; // which document this chunk belongs to
  source: string; // original file name
  page: number | null; // 1-based page for PDFs, null for plain text
  snippet: string; // short preview of the chunk text
}

/** A document that has been uploaded and indexed. */
export interface IndexedDoc {
  docId: string;
  source: string;
  chunkCount: number;
}

/** A chunk's text + metadata (no embedding) — used by the document viewer. */
export interface PublicChunk {
  id: string;
  docId: string;
  source: string;
  page: number | null;
  chunkIndex: number;
  text: string;
}

export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  citations?: Citation[];
  /** which retrieval stages produced this answer (e.g. ["hybrid…", "rerank"]) */
  retrievalStages?: string[];
  /** true while assistant tokens are still streaming in */
  streaming?: boolean;
  error?: boolean;
}

/** Events the SSE chat stream emits (must match server/src/routes/chat.ts). */
export type ChatStreamEvent =
  | { type: "token"; text: string }
  | { type: "citations"; items: Citation[] }
  | { type: "trace"; stages: string[]; candidateCount: number }
  | { type: "done" }
  | { type: "error"; message: string };
