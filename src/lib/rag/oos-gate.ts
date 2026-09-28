/**
 * Out-of-scope gate for the sources shown under a RAG answer.
 *
 * Hybrid retrieval has no similarity floor — it always returns its top-k — so a
 * question the knowledge base cannot answer still arrives with a full Sources
 * panel of unrelated documents, and their figures get inlined into a "no
 * information found" answer (QA CHAT-034: a temple statue figure under a
 * question about flamingo migration).
 *
 * 0.4 is the threshold the RAG trace already uses for `oosLikely`: the eval
 * baseline's out-of-scope canaries scored 0.27–0.34 and the weakest valid
 * lookups 0.55+, so the gate sits in the gap rather than on either cluster.
 */
export const OOS_MAX_VECTOR_SCORE = 0.4

/**
 * True when retrieval ran but nothing it found is semantically close enough to
 * cite. `vectorScores` are raw cosine similarities; zeros (graph-only hits with
 * no vector score) are ignored, and an empty list is never judged out of scope
 * because there is no signal to judge by.
 */
export function isLikelyOutOfScope(
  vectorScores: number[],
  threshold: number = OOS_MAX_VECTOR_SCORE,
): boolean {
  const scored = vectorScores.filter((s) => s > 0)
  if (scored.length === 0) return false
  return Math.max(...scored) < threshold
}
