export interface RrfOptions<T extends RrfItem = RrfItem> {
  /** RRF constant — larger values flatten rank differences. Default 60 per original paper. */
  k?: number
  /** Max results returned after fusion. Default: unlimited. */
  limit?: number
  /**
   * Exact identifiers that must each be guaranteed at least one slot in the fused output
   * before filling remaining slots (TC-994).
   */
  guaranteedIdentifiers?: string[]
  /**
   * Optional custom extractor for matched identifiers on an item.
   */
  getMatchedIdentifiers?: (item: T) => string[]
}

export interface RrfItem {
  id: string
  matchedIdentifiers?: string[]
  content?: string
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
 * Pure function to guarantee at least one slot per exact-identifier match before
 * filling remaining slots up to the limit (TC-994).
 */
export function guaranteeIdentifierSlots<T>(
  items: T[],
  guaranteedIdentifiers?: string[],
  limit?: number,
  getMatchedIdentifiers?: (item: T) => string[]
): T[] {
  if (!guaranteedIdentifiers?.length || items.length === 0) {
    return limit !== undefined ? items.slice(0, limit) : items
  }

  const maxSlots = limit !== undefined ? limit : items.length
  if (maxSlots <= 0) return []

  const normGuaranteed = Array.from(
    new Set(guaranteedIdentifiers.map((g) => g.trim().toLowerCase()).filter(Boolean))
  )
  if (normGuaranteed.length === 0) {
    return limit !== undefined ? items.slice(0, limit) : items
  }

  const resolveItemIdentifiers = (item: T): string[] => {
    if (getMatchedIdentifiers) {
      return getMatchedIdentifiers(item)
    }
    const anyItem = item as Record<string, unknown>
    if (Array.isArray(anyItem.matchedIdentifiers)) {
      return anyItem.matchedIdentifiers as string[]
    }
    if (typeof anyItem.matchedIdentifier === "string") {
      return [anyItem.matchedIdentifier]
    }
    return []
  }

  // Find the top-ranked item in `items` for each guaranteed identifier.
  const guaranteedItemByCode = new Map<string, T>()
  for (const item of items) {
    const itemIds = resolveItemIdentifiers(item).map((id) => id.toLowerCase())
    const content = typeof (item as any).content === "string" ? ((item as any).content as string).toLowerCase() : null

    for (const code of normGuaranteed) {
      if (!guaranteedItemByCode.has(code)) {
        const matches = itemIds.includes(code) || (content !== null && content.includes(code))
        if (matches) {
          guaranteedItemByCode.set(code, item)
        }
      }
    }
  }

  // Unique items that were awarded guaranteed slots
  const guaranteedItemsSet = new Set(guaranteedItemByCode.values())

  if (guaranteedItemsSet.size >= maxSlots) {
    // If guaranteed matches equal or exceed maxSlots, pick top guaranteed items in rank order
    return items.filter((it) => guaranteedItemsSet.has(it)).slice(0, maxSlots)
  }

  // Reserve slots for the guaranteed items, and fill remaining slots from the rest
  const remainingSlotCount = maxSlots - guaranteedItemsSet.size
  const remainingItems: T[] = []
  for (const it of items) {
    if (!guaranteedItemsSet.has(it)) {
      remainingItems.push(it)
      if (remainingItems.length === remainingSlotCount) {
        break
      }
    }
  }

  const selectedSet = new Set([...guaranteedItemsSet, ...remainingItems])
  return items.filter((it) => selectedSet.has(it))
}

/**
 * Reciprocal Rank Fusion — merges N ranked lists of items with shared string ids.
 * Score for item i across lists L_1..L_n is sum over lists of 1 / (k + rank(i, L_j)).
 * Higher is better. Order-stable for ties (preserves first-seen insertion order).
 * Supports slot guarantee for exact identifier matches (TC-994).
 */
export function reciprocalRankFusion<T extends RrfItem>(
  lists: Array<Array<T>>,
  opts: RrfOptions<T> = {}
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
        if (Array.isArray(item.matchedIdentifiers) && item.matchedIdentifiers.length > 0) {
          const current = (existing.first.matchedIdentifiers || [])
          const mergedIds = Array.from(new Set([...current, ...item.matchedIdentifiers]))
          existing.first = { ...existing.first, matchedIdentifiers: mergedIds }
        }
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

  if (opts.guaranteedIdentifiers?.length) {
    return guaranteeIdentifierSlots(
      merged,
      opts.guaranteedIdentifiers,
      opts.limit,
      (r) => {
        if (opts.getMatchedIdentifiers) {
          return opts.getMatchedIdentifiers(r.first)
        }
        if (Array.isArray(r.first.matchedIdentifiers)) {
          return r.first.matchedIdentifiers
        }
        return []
      }
    )
  }

  if (opts.limit !== undefined) return merged.slice(0, opts.limit)
  return merged
}
