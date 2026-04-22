import type { Extractor, ExtractionResult } from "./types";
import { isUnpdfSufficient, DEFAULT_ROUTER_OPTS, type RouterOpts } from "./text-layer-signals";

/**
 * SmartRouterExtractor — runs a text-layer extractor first, falls through to
 * an OCR fallback only when heuristics flag the text-layer output as
 * insufficient for retrieval.
 *
 * Empirically: on a 40-doc mixed bench this routes prose-heavy born-digital
 * PDFs to unpdf (50 ms, 100% coverage on resumes) while sending scans and
 * table-heavy docs to MinerU (97% coverage on Indonesian scans).
 *
 * See docs/superpowers/specs/2026-04-22-smart-router-extractor-design.md.
 */
export class SmartRouterExtractor implements Extractor {
  readonly name: string;
  private readonly textLayer: Extractor;
  private readonly fallback: Extractor;
  private readonly opts: RouterOpts;

  constructor(textLayer: Extractor, fallback: Extractor, opts?: Partial<RouterOpts>) {
    this.textLayer = textLayer;
    this.fallback = fallback;
    this.opts = { ...DEFAULT_ROUTER_OPTS, ...(opts ?? {}) };
    this.name = `SmartRouter(${textLayer.name}+${fallback.name})`;
  }

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    let textLayerResult: ExtractionResult | null = null;
    let textLayerErr: Error | null = null;

    try {
      textLayerResult = await this.textLayer.extract(pdfBuffer);
    } catch (err) {
      textLayerErr = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[rag/smart-router] text-layer extractor ${this.textLayer.name} threw (${textLayerErr.message.slice(0, 100)}), falling through to ${this.fallback.name}`,
      );
    }

    if (textLayerResult) {
      const pageCount = textLayerResult.pages ?? 1;
      if (isUnpdfSufficient(textLayerResult.text, pageCount, this.opts)) {
        return {
          ...textLayerResult,
          model: `smart(${textLayerResult.model ?? this.textLayer.name})`,
        };
      }
    }

    try {
      const fallbackResult = await this.fallback.extract(pdfBuffer);
      return {
        ...fallbackResult,
        model: `smart(fallback:${fallbackResult.model ?? this.fallback.name})`,
      };
    } catch (err) {
      const fbMsg = (err instanceof Error ? err.message : String(err)).slice(0, 150);
      const tlMsg = textLayerErr ? textLayerErr.message.slice(0, 150) : "insufficient output";
      throw new Error(
        `Both extractors failed — textLayer(${this.textLayer.name}): ${tlMsg}; fallback(${this.fallback.name}): ${fbMsg}`,
      );
    }
  }
}
