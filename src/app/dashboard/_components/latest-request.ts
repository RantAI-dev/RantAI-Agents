/**
 * "Latest request wins" gate for type-ahead search. Starting a request aborts
 * the previous one, and `isCurrent()` lets a response that was already in
 * flight (abort raced its completion) check it is still the newest before it
 * writes state — otherwise a slow response for "ab" can overwrite the results
 * for "abc" (QA TC-791).
 */
export function createLatestRequestGate() {
  let seq = 0
  let controller: AbortController | null = null

  return {
    begin(): { signal: AbortSignal; isCurrent: () => boolean } {
      controller?.abort()
      const mine = new AbortController()
      controller = mine
      const id = ++seq
      return { signal: mine.signal, isCurrent: () => id === seq }
    },
    /** Abort whatever is in flight and invalidate it (e.g. dialog closed). */
    cancel() {
      controller?.abort()
      controller = null
      seq++
    },
  }
}
