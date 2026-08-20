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

/** Which optional pipeline steps the resolved per-type policy runs. Skipped
 *  steps carry zero weight so the bar never reserves space for work that will
 *  not happen (an xlsx used to "jump" the 10% figure slice instantly). */
export interface ProgressFlags {
  entities: boolean
  figures: boolean
}

// Relative step costs; skipped steps are zeroed and the rest normalized to 100.
const BASE_COSTS: Record<IngestStep, number> = {
  queued: 0,
  extracting: 45,
  chunking: 4,
  extracting_entities: 22,
  processing_figures: 10,
  embedding: 12,
  storing: 7,
  done: 0,
}

const ORDER: IngestStep[] = [
  "queued",
  "extracting",
  "chunking",
  "extracting_entities",
  "processing_figures",
  "embedding",
  "storing",
  "done",
]

function weightsFor(flags: ProgressFlags): Record<IngestStep, number> {
  const w = { ...BASE_COSTS }
  if (!flags.entities) w.extracting_entities = 0
  if (!flags.figures) w.processing_figures = 0
  const sum = ORDER.reduce((a, s) => a + w[s], 0)
  for (const s of ORDER) w[s] = (w[s] / sum) * 100
  return w
}

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
export function computeOverallProgress(sp: StepProgress, flags: ProgressFlags): number {
  if (sp.step === "done") return 100

  const weights = weightsFor(flags)

  const idx = ORDER.indexOf(sp.step)
  if (idx < 0) return 0

  let completed = 0
  for (let i = 0; i < idx; i++) completed += weights[ORDER[i]]

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
