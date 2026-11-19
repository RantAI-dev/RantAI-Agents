/**
 * Circuit breaker for the practice label model (AGENT_API_PRACTICE_LABEL_MODEL).
 *
 * UAT issue 11's log trail: the label model was failing every call with
 * "Token Plan usage limit reached", and with the SDK's built-in retries that
 * burned ~17 s per request before the derived labels took over. This module
 * skips the model entirely for 10 minutes after such an error, so quota and
 * auth problems cost one attempt, not one per request.
 *
 * The breaker is module-level state on purpose: every request on this
 * process shares it. The clock is injectable so tests can age it without
 * waiting; `_resetLabelBreaker` restores a pristine state between tests.
 */

/** Errors worth skipping the model for: quota/auth/limit, not transient noise. */
const BREAKER_ERROR =
  /usage limit|rate limit|quota|insufficient|\b(401|403|429)\b/i

/** How long the model is skipped after a breaker error. */
export const LABEL_BREAKER_MS = 10 * 60 * 1000

let now: () => number = () => Date.now()
let openUntil = 0
// Starts "already closed": the close line belongs to an open/close cycle only.
let closedLogged = true

/** True when the error text says the model will keep failing (quota, auth, rate limit). */
export function isBreakerError(message: string): boolean {
  return BREAKER_ERROR.test(message)
}

/** True while the label model is skipped. */
export function labelBreakerOpen(): boolean {
  return now() < openUntil
}

/**
 * Skip the label model for the next 10 minutes. Logs once per open; the
 * matching "closed" line is logged by `labelBreakerClosedNotice` when a later
 * request finds the window expired.
 */
export function openLabelBreaker(reason: string): void {
  openUntil = now() + LABEL_BREAKER_MS
  closedLogged = false
  console.warn(`[V1 Practice] label model circuit breaker opened for 10 min: ${reason.slice(0, 120)}`)
}

/**
 * Call after `labelBreakerOpen()` reports false: logs the breaker's close
 * exactly once per open/close cycle, then stays quiet while it is healthy.
 */
export function labelBreakerClosedNotice(): void {
  if (closedLogged) return
  closedLogged = true
  console.info("[V1 Practice] label model circuit breaker closed; trying the model again")
}

/** Test seam: control time instead of waiting 10 real minutes. */
export function _setLabelBreakerClock(fn: () => number): void {
  now = fn
}

/** Test seam: forget any open breaker and its logging state. */
export function _resetLabelBreaker(): void {
  openUntil = 0
  closedLogged = true
}
