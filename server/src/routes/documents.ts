import { Router } from "express";
import { listDocuments, getDocumentChunks } from "../rag/store.js";

const router = Router();

// GET /api/documents — list every indexed document (for the sidebar / viewer).
router.get("/", (_req, res) => {
  res.json({ documents: listDocuments() });
});

// GET /api/documents/:docId/chunks — full text of a document's chunks (no
// embeddings) so the frontend can render and highlight source passages.
router.get("/:docId/chunks", (req, res) => {
  const chunks = getDocumentChunks(req.params.docId);
  if (chunks.length === 0) {
    return res.status(404).json({ error: "Document not found." });
  }
  res.json({ docId: req.params.docId, chunks });
});

export default router;
