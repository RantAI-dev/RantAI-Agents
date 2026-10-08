/**
 * Whether an answer had book material to stand on.
 *
 * Hybrid retrieval has no similarity floor: it always returns its top-k, so a
 * question the books cannot answer still arrives with a full list of sources.
 * A client that must show "I don't know based on the available books" cannot
 * tell that case from a grounded answer by looking at `sources`. This reports
 * it explicitly, together with the score it was decided on so a deployment can
 * calibrate the threshold against its own corpus.
 */
import { OOS_MAX_VECTOR_SCORE } from "@/lib/rag/oos-gate"

export interface Grounding {
  grounded: boolean
  /** Best cosine similarity among the retrieved chunks, 0–1, three decimals. */
  retrieval_score: number
}

export function groundingThreshold(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AGENT_API_GROUNDED_MIN_SCORE)
  return env.AGENT_API_GROUNDED_MIN_SCORE?.trim() && Number.isFinite(n) && n > 0 && n < 1 ? n : OOS_MAX_VECTOR_SCORE
}

export function groundingOf(vectorScores: number[], threshold: number = groundingThreshold()): Grounding {
  // Graph-only hits carry no vector score (0); they say nothing either way.
  const best = Math.max(0, ...vectorScores.filter((s) => Number.isFinite(s) && s > 0))
  return { grounded: best >= threshold, retrieval_score: Math.round(best * 1000) / 1000 }
}
