/** A figure/chart cropped from a page (multimodal RAG fase 2). */
export interface ExtractedFigure {
  type: string;            // "image" | "chart" | "image_block"
  page: number;            // 0-based page index
  bbox: [number, number, number, number]; // normalized [0,1]
  caption: string | null;
  /** base64-encoded PNG crop (no data: prefix). */
  imageBase64: string;
  /** Stable per-page handle ("p12-b3"), matching the id used in `pagesBlocks`. */
  id?: string;
  /** Position among the page's blocks in READING ORDER.
   *
   *  This is the anchor. Curriculum books print no caption for 19-34% of their
   *  figures, so caption matching is structurally blind on a third of them —
   *  but the layout model always knows where on the page a figure sits relative
   *  to the prose. Extraction knew this all along and the Node side discarded
   *  it, forcing placement to be re-guessed from caption keywords at query
   *  time. */
  blockIndex?: number;
}

/** One page's blocks in reading order, with figures inline at their position. */
export interface PageBlocks {
  kind: "text" | "caption" | "figure";
  /** Set when kind === "figure"; matches ExtractedFigure.id. */
  id?: string;
  /** Set for text/caption blocks. */
  text?: string;
}

export interface ExtractionResult {
  text: string;
  ms: number;
  pages?: number;
  model: string;
  figures?: ExtractedFigure[];
  /**
   * Ordered text blocks with their 0-based page index (from layout parsers
   * that expose per-block pages, e.g. MinerU content_list). Used to attach a
   * page number to each text chunk so sources can show "hal. N". Optional —
   * extractors without page info omit it and chunk pages stay null.
   */
  pageMap?: Array<{ page: number; text: string }>;
  /**
   * Per-page reading-order block sequences, figures inline at their own
   * position. Present only from extractors that expose layout order (the
   * on-prem MinerU sidecar does). This is what lets a figure be attached to the
   * text chunk it actually belongs to rather than to whatever caption keyword
   * happened to match.
   */
  pagesBlocks?: PageBlocks[][];
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
