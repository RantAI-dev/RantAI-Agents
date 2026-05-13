import type { GoldenEntry, QueryResult, RunReport } from "./types"

/**
 * Pure scoring functions. No I/O, no DB — given a golden entry + a query
 * result, return a number. The runner calls these to build the per-query
 * report; the summarizer aggregates across all entries.
 */

/**
 * context_recall — what fraction of expectedDocs appeared in retrievedDocs.
 * Match is case-insensitive substring (title.includes(expected)) so an entry
 * like "PSAK 113" matches "PSAK 113 Pengukuran Nilai Wajar".
 * Returns null when the entry has no expectedDocs (nothing to score against).
 */
export function contextRecall(entry: GoldenEntry, result: QueryResult): number | null {
  if (!entry.expectedDocs.length) return null
  const lowered = result.retrievedDocs.map((d) => d.toLowerCase())
  const hits = entry.expectedDocs.filter((expected) => {
    const needle = expected.toLowerCase()
    return lowered.some((retrieved) => retrieved.includes(needle))
  })
  return hits.length / entry.expectedDocs.length
}

/** Number of expectedDocs that matched (numerator of contextRecall). */
export function expectedDocsHit(entry: GoldenEntry, result: QueryResult): number {
  if (!entry.expectedDocs.length) return 0
  const lowered = result.retrievedDocs.map((d) => d.toLowerCase())
  return entry.expectedDocs.filter((expected) => {
    const needle = expected.toLowerCase()
    return lowered.some((retrieved) => retrieved.includes(needle))
  }).length
}

/** p-th percentile over a numeric array. Returns 0 on empty. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

/**
 * Aggregate all per-query results into a single summary block. Mean recall
 * weights every entry equally — fine for small golden sets, may want to
 * stratify by `kind` once the set grows past a few hundred entries.
 */
export function summarize(
  entries: GoldenEntry[],
  results: QueryResult[]
): RunReport["summary"] {
  const byId = new Map(results.map((r) => [r.id, r]))
  const recallValues: number[] = []
  let expectedDocsHitCount = 0
  let expectedDocsTotal = 0

  for (const entry of entries) {
    const result = byId.get(entry.id)
    if (!result || result.errored) continue
    const recall = contextRecall(entry, result)
    if (recall !== null) recallValues.push(recall)
    expectedDocsHitCount += expectedDocsHit(entry, result)
    expectedDocsTotal += entry.expectedDocs.length
  }

  const latencies = results
    .filter((r) => !r.errored)
    .map((r) => r.retrieveMs)

  return {
    queryCount: results.length,
    erroredCount: results.filter((r) => r.errored).length,
    contextRecall: recallValues.length
      ? recallValues.reduce((a, b) => a + b, 0) / recallValues.length
      : 0,
    expectedDocsHitCount,
    expectedDocsTotal,
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
  }
}
