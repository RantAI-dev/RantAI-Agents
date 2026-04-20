export interface ExtractionResult {
  text: string;
  ms: number;
  pages?: number;
  model: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
}

export interface Extractor {
  readonly name: string;
  extract(pdfBuffer: Buffer): Promise<ExtractionResult>;
}
