/**
 * Per-key in-process mutex (promise chain).
 *
 * Serializes long-term profile read-merge-write for one user inside this process so
 * a saveMemory tool call, a forgetMemory call and the post-stream drain for the same
 * user cannot interleave and lose each other's writes. Cross-process safety comes from
 * the compare-and-swap in long-term-memory.ts; this lock just keeps same-process
 * callers from burning CAS retries against each other.
 *
 * Entries are removed when their chain drains, so the map does not grow with the
 * number of users ever seen (QA CHAT-058 soak growth).
 */

const tails = new Map<string, Promise<void>>()

export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = prev.then(() => current)
  tails.set(key, tail)

  await prev
  try {
    return await fn()
  } finally {
    release()
    // Only the last waiter clears the entry; later arrivals replaced the tail.
    if (tails.get(key) === tail) tails.delete(key)
  }
}

/** Test/diagnostic hook: number of keys with an active or queued holder. */
export function activeLockCount(): number {
  return tails.size
}
