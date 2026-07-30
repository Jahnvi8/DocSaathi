import type { ChatStreamEvent, IndexedDoc, PublicChunk } from "../types";

export interface UploadResult {
  docId: string;
  source: string;
  chunkCount: number;
  pages: number;
}

/** Upload a PDF/txt file to be chunked, embedded, and indexed. */
export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data as UploadResult;
}

/** List all indexed documents. */
export async function listDocuments(): Promise<IndexedDoc[]> {
  const res = await fetch("/api/documents");
  const data = await res.json().catch(() => ({ documents: [] }));
  return (data.documents ?? []) as IndexedDoc[];
}

/** Delete an indexed document (and all its chunks). */
export async function deleteDocument(docId: string): Promise<void> {
  const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not delete the document.");
  }
}

/** Fetch a document's chunks (text only) for the source viewer. */
export async function getDocumentChunks(docId: string): Promise<PublicChunk[]> {
  const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/chunks`);
  const data = await res.json().catch(() => ({ chunks: [] }));
  if (!res.ok) throw new Error(data.error || "Could not load document.");
  return (data.chunks ?? []) as PublicChunk[];
}

// We consume SSE with fetch (not the native EventSource) because EventSource can
// only do GET with no body — we need to POST the question/docId. The server sends
// SSE frames ("data: {...}\n\n") which streamSSE (below) reads and parses.

/** Stream a summary of a just-uploaded document (same SSE contract as chat). */
export async function streamSummary(
  docId: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  return streamSSE("/api/summary", { docId }, onEvent, signal);
}

export async function streamChat(
  question: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
  docId?: string
): Promise<void> {
  // docId (optional) scopes retrieval to a single selected document.
  return streamSSE("/api/chat", { question, ...(docId ? { docId } : {}) }, onEvent, signal);
}

/** Shared Server-Sent Events reader: POST a JSON body, parse `data:` frames. */
async function streamSSE(
  url: string,
  body: Record<string, unknown>,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    // Non-streaming error (e.g. server down) — surface it as an error event.
    const data = await res.json().catch(() => ({}));
    onEvent({ type: "error", message: data.error || `Request failed (${res.status}).` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line ("\n\n").
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.slice("data:".length).trim();
      if (!json) continue;

      try {
        onEvent(JSON.parse(json) as ChatStreamEvent);
      } catch {
        // Ignore malformed frames rather than crashing the stream.
      }
    }
  }
}
