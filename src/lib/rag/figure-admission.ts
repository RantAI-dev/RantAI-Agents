/**
 * How many ranked figure candidates to admit — the rule, isolated.
 *
 * Selection hides two decisions: how to ORDER candidates (the reranker's job)
 * and how many to ADMIT (this file). The second used to be an absolute floor on
 * the reranker's score, and that turned out to be the single largest source of
 * silent failure we have measured.
 *
 * ── Why an absolute floor is the wrong shape ──────────────────────────────
 * A cross-encoder's score distribution is a property of the TEXT it ranks, not
 * of relevance. Rank author-written descriptions and good matches sit at
 * 0.5–0.8; rank a twenty-character printed caption and the same relevance lands
 * at 0.016. One constant cannot serve both, and when it is too high the failure
 * is invisible: nothing is emitted, no error is raised, and the stage after it
 * starves. That is exactly how the 0.2 floor kept the vision gate from ever
 * running in production while every component test passed.
 *
 * Lowering the constant does not fix the shape. Measured across seven external
 * evaluation domains (6,819 questions), an absolute floor at 0.1 scored macro
 * F1 51.45 with a worst domain of 11.31 — 86% of those questions answered with
 * no figure at all — and even at 0.001 the worst domain stayed 48% mute. Every
 * scale-free rule tested landed within about one macro point of every other
 * (61.99–68.06) with no domain collapsing anywhere. The choice of rule FAMILY
 * is worth ~16 macro points; the choice within the family is worth ~1.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 * Admit candidates scoring at least `alpha` times the best score for THIS
 * query, then cap the count. Because the cut references only the query's own
 * distribution, it cannot go silent wholesale when a corpus shifts the scores,
 * and it needs no per-corpus tuning — which is the property a multi-tenant KB
 * actually needs, since each knowledge base is a different corpus.
 *
 * Setting KB_FIGURE_MIN_RERANK still selects the old absolute behaviour, so a
 * deployment that depends on it can pin the previous semantics without a
 * rebuild.
 */

export type AdmissionRule =
  | { kind: "relative"; alpha: number; maxKeep: number }
  | { kind: "absolute"; min: number; maxKeep: number }

/** Default share of the top score a candidate must reach to be admitted. */
export const DEFAULT_ALPHA = 0.2
/** Default cap on admitted candidates, before the vision gate narrows further. */
export const DEFAULT_MAX_KEEP = 3

export function admissionRule(env: NodeJS.ProcessEnv = process.env): AdmissionRule {
  const maxRaw = Number(env.KB_FIGURE_MAX_PER_ANSWER)
  const maxKeep = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : DEFAULT_MAX_KEEP

  // An explicit absolute floor is an escape hatch, not the default: honouring it
  // keeps existing deployments byte-identical until they choose to move.
  const raw = env.KB_FIGURE_MIN_RERANK
  if (raw !== undefined && raw !== "") {
    const min = Number(raw)
    if (Number.isFinite(min)) return { kind: "absolute", min, maxKeep }
  }

  const aRaw = Number(env.KB_FIGURE_REL_ALPHA)
  const alpha = Number.isFinite(aRaw) && aRaw > 0 && aRaw <= 1 ? aRaw : DEFAULT_ALPHA
  return { kind: "relative", alpha, maxKeep }
}

/**
 * Apply the rule to scored candidates, best first.
 *
 * Input need not be sorted; output is sorted by score descending. Candidates
 * with a non-finite score are treated as 0 rather than dropped silently, so a
 * broken reranker degrades to "admit the top few" instead of to silence.
 */
export function admit<T>(
  candidates: Array<{ item: T; score: number }>,
  rule: AdmissionRule,
): Array<{ item: T; score: number }> {
  if (!candidates.length) return []
  const ranked = candidates
    .map((c) => ({ item: c.item, score: Number.isFinite(c.score) ? c.score : 0 }))
    .sort((a, b) => b.score - a.score)

  if (rule.kind === "absolute") {
    return ranked.filter((c) => c.score >= rule.min).slice(0, rule.maxKeep)
  }

  const best = ranked[0]!.score
  // A top score of zero means the reranker separated nothing; relative to zero
  // every candidate ties, so fall back to the cap rather than admitting all.
  const cut = best > 0 ? rule.alpha * best : 0
  return ranked.filter((c) => c.score >= cut).slice(0, rule.maxKeep)
}

/** One-line description for the retrieval log, so the live rule is never a guess. */
export function describeRule(rule: AdmissionRule): string {
  return rule.kind === "absolute"
    ? `absolute>=${rule.min} cap ${rule.maxKeep}`
    : `relative>=${rule.alpha}*max cap ${rule.maxKeep}`
}
