import { Router, type Request, type Response } from "express";
import { assertApiKey } from "../config.js";
import { getDocumentChunks } from "../rag/store.js";
import { streamSummary } from "../llm/gemini.js";

const router = Router();

function send(res: Response, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// POST /api/summary  { docId }  → text/event-stream
//
// Streams a short, friendly summary of a just-uploaded document. Reuses the same
// SSE contract as /api/chat (token / done / error) so the client can render it as
// a normal streaming assistant message.
router.post("/", async (req: Request, res: Response) => {
  const docId = String(req.body?.docId ?? "").trim();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let clientGone = false;
  res.on("close", () => {
    if (!res.writableFinished) clientGone = true;
  });

  try {
    if (!docId) {
      send(res, { type: "error", message: "Missing document id." });
      return res.end();
    }
    const chunks = getDocumentChunks(docId);
    if (chunks.length === 0) {
      send(res, { type: "error", message: "Document not found." });
      return res.end();
    }

    assertApiKey();

    const source = chunks[0].source;
    for await (const token of streamSummary(source, chunks.map((c) => c.text))) {
      if (clientGone) break;
      send(res, { type: "token", text: token });
    }

    if (!clientGone) send(res, { type: "done" });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not summarize the document.";
    console.error("[summary] error:", message);
    if (!clientGone) send(res, { type: "error", message });
    res.end();
  }
});

export default router;
