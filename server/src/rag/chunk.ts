import type { ExtractedPage } from "../lib/pdf.js";

// ~600 tokens ≈ 2400 characters (rough 4-chars-per-token heuristic). We add a
// 300-char overlap so a sentence straddling a chunk boundary still appears
// whole in at least one chunk — important for retrieval quality.
const CHUNK_CHARS = 2400;
const OVERLAP_CHARS = 300;

/** A chunk before it has an embedding attached. */
export interface RawChunk {
  text: string;
  page: number | null;
  chunkIndex: number;
}

/**
 * Split a piece of text into ~CHUNK_CHARS windows with OVERLAP_CHARS overlap,
 * preferring to end on a sentence boundary near the target size. Handles both
 * English ("." ) and Hindi/Devanagari ("।", the danda) sentence endings.
 */
function splitWithOverlap(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];

  const pieces: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_CHARS, text.length);

    // If we're not at the very end, try to snap `end` back to a nearby sentence
    // boundary so chunks don't cut mid-sentence.
    if (end < text.length) {
      const window = text.slice(start, end);
      const boundary = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("। "),
        window.lastIndexOf("? "),
        window.lastIndexOf("! ")
      );
      // Only snap if the boundary is past the halfway point (avoid tiny chunks).
      if (boundary > CHUNK_CHARS * 0.5) {
        end = start + boundary + 1;
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece) pieces.push(piece);

    if (end >= text.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }

  return pieces;
}

/**
 * Turn extracted pages into an ordered list of chunks. Chunking happens
 * per-page so each chunk keeps an accurate page number for citations.
 */
export function chunkPages(pages: ExtractedPage[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  let index = 0;

  for (const page of pages) {
    // Collapse whitespace so chunk sizes are meaningful and text is clean.
    const clean = page.text.replace(/\s+/g, " ").trim();
    if (!clean) continue;

    for (const piece of splitWithOverlap(clean)) {
      chunks.push({ text: piece, page: page.page, chunkIndex: index });
      index += 1;
    }
  }

  return chunks;
}
