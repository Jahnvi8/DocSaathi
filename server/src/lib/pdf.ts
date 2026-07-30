import pdfParse from "pdf-parse/lib/pdf-parse.js";

/** One unit of extracted text with its source location. */
export interface ExtractedPage {
  /** 1-based page number for PDFs; null for plain-text files. */
  page: number | null;
  text: string;
}

/**
 * Extract text from an uploaded file buffer.
 *
 * - `.txt` → a single page (page = null).
 * - `.pdf` → one ExtractedPage per page, so we can attribute chunks (and
 *   therefore citations) to a specific page number.
 *
 * Throws a clear error for unsupported types.
 */
export async function extractText(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Promise<ExtractedPage[]> {
  const lower = filename.toLowerCase();

  const isTxt = mimetype === "text/plain" || lower.endsWith(".txt");
  const isPdf = mimetype === "application/pdf" || lower.endsWith(".pdf");

  if (isTxt) {
    return [{ page: null, text: buffer.toString("utf-8") }];
  }

  if (isPdf) {
    const pages: ExtractedPage[] = [];
    let pageNum = 0;
    // pdf-parse calls `pagerender` once per page, in order. We use it to capture
    // per-page text (the default renderer only gives us one concatenated string).
    await pdfParse(buffer, {
      pagerender: async (pageData) => {
        pageNum += 1;
        const content = await pageData.getTextContent();
        const text = content.items.map((i) => i.str).join(" ");
        pages.push({ page: pageNum, text });
        return text;
      },
    });
    const nonEmpty = pages.filter((p) => p.text.trim().length > 0);
    if (nonEmpty.length === 0) {
      throw new Error(
        "No text found in this PDF. It may be a scanned image — OCR isn't supported yet."
      );
    }
    return nonEmpty;
  }

  throw new Error("Unsupported file type. Please upload a PDF or .txt file.");
}
