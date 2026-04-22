import type { Extractor, ExtractionResult } from "./types";
import { mergeStructuralWithTextLayer } from "./hybrid-merge";

/**
 * Hybrid extractor that runs a structural extractor (e.g. MinerU2.5-Pro) and a
 * text-layer extractor (e.g. unpdf) IN PARALLEL and merges their output.
 *
 * Why: the structural extractor gives us tables, headings, and correct reading
 * order that text-layer extraction loses, while the text-layer gives us
 * character-perfect prose (no OCR slips on Unicode, emails, unusual glyphs).
 * The merge step keeps all structural blocks verbatim and substitutes
 * text-layer text into prose blocks wherever anchors match cleanly.
 *
 * Latency: bounded by the slower of the two extractors (always the structural
 * one in practice — unpdf finishes in ~50 ms even on large docs). The merge
 * itself is O(n) and adds single-digit milliseconds.
 *
 * Failure modes:
 *   - Structural succeeds, text-layer fails → return structural alone
 *   - Structural fails, text-layer succeeds → return text-layer alone
 *   - Both fail → throw, aggregating both error messages
 *
 * Trigger via env:
 *   KB_EXTRACT_PRIMARY="hybrid"
 *   KB_EXTRACT_MINERU_BASE_URL="http://localhost:8100"   // used for structural
 */
export class HybridExtractor implements Extractor {
  readonly name: string;
  private readonly structural: Extractor;
  private readonly textLayer: Extractor;

  constructor(structural: Extractor, textLayer: Extractor) {
    this.structural = structural;
    this.textLayer = textLayer;
    this.name = `Hybrid(${structural.name}+${textLayer.name})`;
  }

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const t0 = Date.now();
    const [structuralRes, textLayerRes] = await Promise.allSettled([
      this.structural.extract(pdfBuffer),
      this.textLayer.extract(pdfBuffer),
    ]);

    if (structuralRes.status === "fulfilled" && textLayerRes.status === "fulfilled") {
      const merged = mergeStructuralWithTextLayer(
        structuralRes.value.text,
        textLayerRes.value.text,
      );
      return {
        text: merged,
        ms: Date.now() - t0,
        pages: structuralRes.value.pages ?? textLayerRes.value.pages,
        model: `hybrid(${structuralRes.value.model}+${textLayerRes.value.model})`,
        usage: structuralRes.value.usage ?? textLayerRes.value.usage,
      };
    }

    // TS narrows the union so `.reason` only exists on the rejected arm —
    // pull them out explicitly for the non-happy-path branches.
    const structuralErr = structuralRes.status === "rejected" ? (structuralRes.reason as Error) : null;
    const textLayerErr = textLayerRes.status === "rejected" ? (textLayerRes.reason as Error) : null;

    if (structuralRes.status === "fulfilled") {
      console.warn(
        `[rag/hybrid] text-layer extractor ${this.textLayer.name} failed (${textLayerErr?.message?.slice(0, 100)}) — returning structural-only output`,
      );
      return structuralRes.value;
    }

    if (textLayerRes.status === "fulfilled") {
      console.warn(
        `[rag/hybrid] structural extractor ${this.structural.name} failed (${structuralErr?.message?.slice(0, 100)}) — returning text-layer-only output`,
      );
      return textLayerRes.value;
    }

    throw new Error(
      `Both extractors failed — structural(${this.structural.name}): ${structuralErr?.message?.slice(0, 150)}; textLayer(${this.textLayer.name}): ${textLayerErr?.message?.slice(0, 150)}`,
    );
  }
}
