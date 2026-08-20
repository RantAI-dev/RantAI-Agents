import path from "path"

/**
 * Per-file-type ingest policy — the single decision table for what the
 * pipeline does to a document. Replaces the old UI "enhanced" toggle: the
 * system decides per type; the only user knob is figureMode, and only for
 * PDFs (a text-layer textbook full of charts can force the layout parser).
 *
 * Chunking is always the table/code-aware smart chunker — the naive splitter
 * shredded spreadsheet rows, which was the #1 cause of weak table Q&A.
 */

export type FigureMode = "auto" | "force" | "skip"

export interface IngestPolicy {
  /** LLM entity/relation extraction into the knowledge graph. Pointless for
   *  tabular data, code, and OCR'd images; on for prose. */
  entities: boolean
  /** Whether the figure-asset step may run at all (PDF only). */
  figures: boolean
  /** Force the layout-extractor chain even when a text layer exists. */
  forceLayout: boolean
}

const TABULAR = new Set([".xlsx", ".xls", ".ods", ".csv", ".tsv", ".json", ".jsonl"])
const CODE = new Set([
  ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".rb", ".php", ".sh", ".sql", ".r", ".swift", ".kt",
  ".yaml", ".yml", ".toml", ".ini", ".env", ".log",
])
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"])
const MODEL_3D = new Set([".gltf", ".glb"])

export function resolveIngestPolicy(filename: string, figureMode: FigureMode = "auto"): IngestPolicy {
  const ext = path.extname(filename).toLowerCase()

  if (ext === ".pdf") {
    return {
      entities: true,
      figures: figureMode !== "skip",
      forceLayout: figureMode === "force",
    }
  }
  const noEntities = TABULAR.has(ext) || CODE.has(ext) || IMAGE.has(ext) || MODEL_3D.has(ext)
  return { entities: !noEntities, figures: false, forceLayout: false }
}

/** Parse an untrusted request/job param into a FigureMode. */
export function parseFigureMode(value: unknown, legacyForceOCR?: unknown): FigureMode {
  if (value === "force" || value === "skip" || value === "auto") return value
  if (legacyForceOCR === true || legacyForceOCR === "true") return "force"
  return "auto"
}
