import { getRagConfig } from "../config";
import { VisionLlmExtractor } from "./vision-llm-extractor";
import { UnpdfExtractor } from "./unpdf-extractor";
import { MineruExtractor } from "./mineru-extractor";
import { HybridExtractor } from "./hybrid-extractor";
import type { Extractor, ExtractionResult } from "./types";

export type { Extractor, ExtractionResult };
export { VisionLlmExtractor, UnpdfExtractor, MineruExtractor, HybridExtractor };

/**
 * Build an extractor from a model-id sentinel:
 *   "unpdf"  → UnpdfExtractor (text-layer only, no OCR)
 *   "mineru" → MineruExtractor (requires KB_EXTRACT_MINERU_BASE_URL)
 *   "hybrid" → HybridExtractor(MinerU + unpdf) — structural extraction with
 *              text-layer character-fidelity overlay. Runs both in parallel,
 *              so wall-clock ≈ MinerU alone. Requires KB_EXTRACT_MINERU_BASE_URL.
 *   other    → VisionLlmExtractor with that OpenRouter / on-prem model id
 */
function buildExtractor(modelId: string): Extractor {
  if (modelId === "unpdf") return new UnpdfExtractor();
  if (modelId === "mineru") {
    return new MineruExtractor(getRagConfig().extractMineruBaseUrl);
  }
  if (modelId === "hybrid") {
    const mineruUrl = getRagConfig().extractMineruBaseUrl;
    return new HybridExtractor(new MineruExtractor(mineruUrl), new UnpdfExtractor());
  }
  return new VisionLlmExtractor(modelId);
}

export function getDefaultExtractor(): Extractor {
  return buildExtractor(getRagConfig().extractPrimary);
}

export function getFallbackExtractor(): Extractor {
  return buildExtractor(getRagConfig().extractFallback);
}

/**
 * Run `primary.extract`; if it throws, log + retry with `fallback`.
 * Throws if both fail.
 */
export async function extractWithFallback(
  pdfBuffer: Buffer,
  primary: Extractor,
  fallback: Extractor
): Promise<ExtractionResult> {
  try {
    return await primary.extract(pdfBuffer);
  } catch (err) {
    console.warn(
      `[rag/extractors] primary ${primary.name} failed (${(err as Error).message.slice(0, 120)}), falling back to ${fallback.name}`
    );
    return await fallback.extract(pdfBuffer);
  }
}
