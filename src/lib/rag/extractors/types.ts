/** A figure/chart cropped from a page (multimodal RAG fase 2). */
export interface ExtractedFigure {
  type: string;            // "image" | "chart" | "image_block"
  page: number;            // 0-based page index
  bbox: [number, number, number, number]; // normalized [0,1]
  caption: string | null;
  /** base64-encoded PNG crop (no data: prefix). */
  imageBase64: string;
}

export interface ExtractionResult {
  text: string;
  ms: number;
  pages?: number;
  model: string;
  figures?: ExtractedFigure[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
}

export interface Extractor {
  readonly name: string;
  /** opts.withFigures requests cropped figures (MinerU structured mode). */
  extract(pdfBuffer: Buffer, opts?: { withFigures?: boolean }): Promise<ExtractionResult>;
}
