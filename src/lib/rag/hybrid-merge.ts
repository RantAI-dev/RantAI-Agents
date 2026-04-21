export interface RrfOptions {
  /** RRF constant — larger values flatten rank differences. Default 60 per original paper. */
  k?: number
  /** Max results returned after fusion. Default: unlimited. */
  limit?: number
}

export interface RrfItem {
  id: string
}

/** One entry in the fused output — carries the original item via `first`. */
export interface RrfResult<T extends RrfItem> {
  id: string
  rrfScore: number
  /** Indices of the input lists that contributed this item. Useful for telemetry / debugging. */
  sources: number[]
  /** The first-seen source item, preserved verbatim so callers keep domain fields. */
  first: T
}

/**
 * Reciprocal Rank Fusion — merges N ranked lists of items with shared string ids.
 * Score for item i across lists L_1..L_n is sum over lists of 1 / (k + rank(i, L_j)).
 * Higher is better. Order-stable for ties (preserves first-seen insertion order).
 */
export function reciprocalRankFusion<T extends RrfItem>(
  lists: Array<Array<T>>,
  opts: RrfOptions = {}
): Array<RrfResult<T>> {
  const k = opts.k ?? 60
  const scores = new Map<
    string,
    { score: number; sources: number[]; first: T; insertIndex: number }
  >()
  let nextInsert = 0

  lists.forEach((list, listIdx) => {
    list.forEach((item, rank) => {
      const contribution = 1 / (k + rank + 1) // +1 so rank 0 → 1/(k+1), not 1/k
      const existing = scores.get(item.id)
      if (existing) {
        existing.score += contribution
        existing.sources.push(listIdx)
      } else {
        scores.set(item.id, {
          score: contribution,
          sources: [listIdx],
          first: item,
          insertIndex: nextInsert++,
        })
      }
    })
  })

  const merged = Array.from(scores.entries())
    .map(([id, v]) => ({
      id,
      rrfScore: v.score,
      sources: v.sources,
      first: v.first,
      insertIndex: v.insertIndex,
    }))
    .sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore
      return a.insertIndex - b.insertIndex
    })
    .map(({ insertIndex: _ignore, ...rest }) => rest)

  if (opts.limit !== undefined) return merged.slice(0, opts.limit)
  return merged
}
