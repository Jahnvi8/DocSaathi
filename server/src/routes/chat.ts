import { Router, type Request, type Response } from "express";
import { assertApiKey } from "../config.js";
import { isEmpty } from "../rag/store.js";
import { retrieveWithTrace } from "../rag/retrieve.js";
import { streamAnswer } from "../llm/gemini.js";
import type { Citation } from "../rag/store.js";

const router = Router();

/** Write one Server-Sent Event frame. */
function send(res: Response, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// POST /api/chat  { question: string }  → text/event-stream
//
// We use SSE (not plain JSON) so the answer streams to the browser token-by-token
// as the model produces it. We use POST (via fetch on the client) rather than the
// native EventSource because EventSource can only issue GET requests with no body.
router.post("/", async (req: Request, res: Response) => {
  const question = String(req.body?.question ?? "").trim();

  // Set up the SSE stream up front so even errors are delivered as events.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering
  res.flushHeaders();

  // Stop work if the client navigates away / aborts the connection.
  //
  // NOTE: we listen on the RESPONSE, not the request. In modern Node the
  // request stream's "close" fires as soon as the request *body* has been read
  // (which is almost immediately), so req.on("close") would wrongly report the
  // client as gone before we've streamed anything. The response's "close" only
  // signals a true disconnect when the response hasn't finished writing yet.
  let clientGone = false;
  res.on("close", () => {
    if (!res.writableFinished) clientGone = true;
  });

  try {
    if (!question) {
      send(res, { type: "error", message: "Please enter a question." });
      return res.end();
    }
    if (isEmpty()) {
      send(res, {
        type: "error",
        message: "No documents indexed yet. Upload a PDF or text file first.",
      });
      return res.end();
    }

    assertApiKey();

    // Retrieve first so citations can be sent before the answer streams — the UI
    // then has the source list ready as [n] markers appear in the text.
    const { scored, trace } = await retrieveWithTrace(question);

    // Surface which retrieval stages ran (nice for demos and the UI).
    send(res, { type: "trace", stages: trace.stages, candidateCount: trace.candidateCount });

    const citations: Citation[] = scored.map((s) => ({
      id: s.chunk.id,
      docId: s.chunk.docId,
      source: s.chunk.source,
      page: s.chunk.page,
      snippet: s.chunk.text.slice(0, 200),
    }));
    send(res, { type: "citations", items: citations });

    // Stream the grounded answer.
    for await (const token of streamAnswer(question, scored)) {
      if (clientGone) break;
      send(res, { type: "token", text: token });
    }

    if (!clientGone) {
      send(res, { type: "done" });
    }
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    console.error("[chat] error:", message);
    if (!clientGone) send(res, { type: "error", message });
    res.end();
  }
});

export default router;
