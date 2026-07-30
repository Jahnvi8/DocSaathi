// pdf-parse ships no type declarations for its internal subpath. We import from
// "pdf-parse/lib/pdf-parse.js" (not the package root) to skip a debug harness in
// the package's index.js that tries to read a bundled test PDF on import.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfTextItem {
    str: string;
  }
  interface PdfPageData {
    getTextContent(): Promise<{ items: PdfTextItem[] }>;
  }
  interface PdfParseOptions {
    /** Called once per page; its return value is concatenated into `.text`. */
    pagerender?: (pageData: PdfPageData) => string | Promise<string>;
    /** Max pages to parse (0 = all). */
    max?: number;
  }
  interface PdfParseResult {
    text: string;
    numpages: number;
  }
  function pdfParse(
    data: Buffer | Uint8Array,
    options?: PdfParseOptions
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
