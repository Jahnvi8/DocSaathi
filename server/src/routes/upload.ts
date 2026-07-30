import { Router, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { assertApiKey, config } from "../config.js";
import { extractText } from "../lib/pdf.js";
import { chunkPages } from "../rag/chunk.js";
import { embedChunks } from "../rag/embed.js";
import { addDocument } from "../rag/store.js";
import { generateChunkContexts } from "../rag/contextual.js";

const router = Router();

// Keep uploads in memory (we only need the bytes long enough to extract text)
// and cap the size so a huge file can't exhaust memory.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.mimetype === "text/plain" ||
      file.originalname.toLowerCase().endsWith(".pdf") ||
      file.originalname.toLowerCase().endsWith(".txt");
    if (ok) cb(null, true);
    else cb(new Error("Only PDF and .txt files are supported."));
  },
});

/** Turn a filename into a safe, unique document id. */
function makeDocId(source: string): string {
  const slug = source.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return `${slug || "doc"}-${Date.now()}`;
}

// POST /api/upload  — field name: "file"
router.post(
  "/",
  (req: Request, res: Response, next: NextFunction) => {
    // Run multer, translating its errors into friendly 400s.
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large (max 15 MB)." });
      }
      if (err) {
        return res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed." });
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate the request first, so the user gets a message about what they
      // sent — before we check server-side config like the API key.
      const file = req.file;
      if (!file || file.size === 0) {
        return res.status(400).json({ error: "No file received, or the file is empty." });
      }

      assertApiKey(); // clear error if no Gemini key configured

      const source = file.originalname;

      // 1. Extract → 2. Chunk
      const pages = await extractText(file.buffer, source, file.mimetype);
      const rawChunks = chunkPages(pages);
      if (rawChunks.length === 0) {
        return res.status(400).json({ error: "Could not extract any text from this file." });
      }

      // 3. (Optional) contextual retrieval: prepend a situating blurb to each
      //    chunk before embedding. Off by default — one LLM call per chunk.
      let contexts: string[] | undefined;
      if (config.retrieval.contextual) {
        const fullText = pages.map((p) => p.text).join("\n");
        console.log(`[upload] contextual retrieval ON — generating context for ${rawChunks.length} chunks…`);
        contexts = await generateChunkContexts(fullText, rawChunks.map((c) => c.text));
      }

      // 4. Embed (chunk, prefixed with its context when present) → 5. Store
      const textsToEmbed = rawChunks.map((c, i) =>
        contexts?.[i] ? `${contexts[i]}\n${c.text}` : c.text
      );
      const embeddings = await embedChunks(textsToEmbed);
      const docId = makeDocId(source);
      addDocument(source, docId, rawChunks, embeddings, contexts);

      res.json({
        docId,
        source,
        chunkCount: rawChunks.length,
        pages: pages.length,
      });
    } catch (err) {
      next(err); // central error handler returns a clean 500 JSON
    }
  }
);

export default router;
