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

/** Fetch a document's chunks (text only) for the source viewer. */
export async function getDocumentChunks(docId: string): Promise<PublicChunk[]> {
  const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/chunks`);
  const data = await res.json().catch(() => ({ chunks: [] }));
  if (!res.ok) throw new Error(data.error || "Could not load document.");
  return (data.chunks ?? []) as PublicChunk[];
}

/**
 * Send a question and consume the Server-Sent Events stream, invoking `onEvent`
 * for each parsed event ({type:"token"|"citations"|"done"|"error"}).
 *
 * We use fetch (not the native EventSource) because EventSource can only do GET
 * with no body — we need to POST the question. The server sends SSE frames
 * ("data: {...}\n\n"); we read the response as a stream and parse them out.
 */
export async function streamChat(
  question: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
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
