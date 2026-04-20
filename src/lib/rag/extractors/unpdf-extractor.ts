import type { Extractor, ExtractionResult } from "./types";

/**
 * Legacy PDF text extractor using `unpdf`. Produces flat text with no layout
 * preservation (no headings, no tables, no paragraph breaks). Kept as an
 * opt-in escape hatch via `KB_EXTRACT_PRIMARY=unpdf`; the 2026-04-20 SOTA audit
 * showed every vision-LLM produces materially better structure.
 */
export class UnpdfExtractor implements Extractor {
  readonly name = "unpdf";

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const t0 = Date.now();
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return {
      text: Array.isArray(text) ? text.join("\n") : text,
      ms: Date.now() - t0,
      pages: totalPages,
      model: "unpdf",
    };
  }
}
