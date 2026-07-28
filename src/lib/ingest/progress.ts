/**
 * Ingest progress model — pure, dependency-free so both the server worker and
 * the client UI can import it.
 *
 * Progress is *weighted* across pipeline steps (OCR dominates), so the bar
 * advances proportionally to real cost rather than jumping one-Nth per step.
 * Within a step, a known `current/total` (page 12/210, batch 3/7) fills that
 * step's slice smoothly; an unknown one holds at the step's start.
 */

export type IngestStep =
  | "queued"
  | "extracting"
  | "chunking"
  | "extracting_entities"
  | "processing_figures"
  | "embedding"
  | "storing"
  | "done"

export interface StepProgress {
  step: IngestStep
  /** In-step counter, e.g. page 12 of 210. Omit when indeterminate. */
  current?: number
  total?: number
}

// Step weights sum to 100. Enhanced mode runs entity extraction; basic does
// not, so its weight is redistributed to the remaining steps.
const WEIGHTS_ENHANCED: Record<IngestStep, number> = {
  queued: 0,
  extracting: 45,
  chunking: 3,
  extracting_entities: 22,
  processing_figures: 10,
  embedding: 12,
  storing: 8,
  done: 0,
}

const WEIGHTS_BASIC: Record<IngestStep, number> = {
  queued: 0,
  extracting: 55,
  chunking: 5,
  extracting_entities: 0,
  processing_figures: 10,
  embedding: 18,
  storing: 12,
  done: 0,
}

const ORDER_ENHANCED: IngestStep[] = [
  "queued",
  "extracting",
  "chunking",
  "extracting_entities",
  "processing_figures",
  "embedding",
  "storing",
  "done",
]

const ORDER_BASIC: IngestStep[] = [
  "queued",
  "extracting",
  "chunking",
  "processing_figures",
  "embedding",
  "storing",
  "done",
]

export const STEP_LABELS: Record<IngestStep, string> = {
  queued: "Queued",
  extracting: "Extracting text",
  chunking: "Chunking",
  extracting_entities: "Analyzing entities",
  processing_figures: "Processing figures",
  embedding: "Embedding",
  storing: "Storing",
  done: "Done",
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Overall 0–100 progress for a step + in-step position.
 * Returns 100 only for `done`; every other step caps at 99 so the bar never
 * shows "complete" before the job actually finishes.
 */
export function computeOverallProgress(sp: StepProgress, enhanced: boolean): number {
  if (sp.step === "done") return 100

  const order = enhanced ? ORDER_ENHANCED : ORDER_BASIC
  const weights = enhanced ? WEIGHTS_ENHANCED : WEIGHTS_BASIC

  const idx = order.indexOf(sp.step)
  if (idx < 0) return 0

  let completed = 0
  for (let i = 0; i < idx; i++) completed += weights[order[i]]

  const fraction =
    sp.current != null && sp.total != null && sp.total > 0 ? clamp(sp.current / sp.total, 0, 1) : 0

  const progress = completed + weights[sp.step] * fraction
  return clamp(Math.round(progress), 0, 99)
}

/**
 * Seconds remaining, from elapsed time and progress fraction. Self-correcting:
 * re-derived on every update. Null while progress is too low to be meaningful
 * or the job hasn't started.
 */
export function computeEtaSeconds(progress: number, startedAt: Date | null | undefined, now: number): number | null {
  if (!startedAt || progress <= 5 || progress >= 100) return null
  const elapsed = (now - startedAt.getTime()) / 1000
  if (elapsed <= 0) return null
  return Math.max(1, Math.round((elapsed * (100 - progress)) / progress))
}

/** Human summary for the card, e.g. "Extracting text · 12/210 · ~2 min left". */
export function formatProgressLabel(sp: {
  step: IngestStep
  stepCurrent?: number | null
  stepTotal?: number | null
  etaSeconds?: number | null
}): string {
  const parts: string[] = [STEP_LABELS[sp.step] ?? sp.step]
  if (sp.stepCurrent != null && sp.stepTotal != null && sp.stepTotal > 0) {
    parts.push(`${sp.stepCurrent}/${sp.stepTotal}`)
  }
  if (sp.etaSeconds != null && sp.etaSeconds > 0) {
    parts.push(sp.etaSeconds >= 60 ? `~${Math.round(sp.etaSeconds / 60)} min left` : `~${sp.etaSeconds}s left`)
  }
  return parts.join(" · ")
}
