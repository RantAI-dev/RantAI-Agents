import { getRagConfig } from "../config";
import { VisionLlmExtractor } from "./vision-llm-extractor";
import { UnpdfExtractor } from "./unpdf-extractor";
import type { Extractor, ExtractionResult } from "./types";

export type { Extractor, ExtractionResult };
export { VisionLlmExtractor, UnpdfExtractor };

function buildExtractor(modelId: string): Extractor {
  if (modelId === "unpdf") return new UnpdfExtractor();
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
