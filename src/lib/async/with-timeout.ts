/**
 * Resolve to `fallback` if `promise` hasn't settled within `ms`, or if it
 * rejects. For optional enrichment (memory recall, etc.) that must never hold
 * a user-facing response hostage. The underlying work is not cancelled.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<{ value: T; timedOut: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ value: fallback, timedOut: true }), ms)
  })
  try {
    return await Promise.race([
      promise.then((value) => ({ value, timedOut: false })).catch(() => ({ value: fallback, timedOut: false })),
      timeout,
    ])
  } finally {
    clearTimeout(timer)
  }
}
