/**
 * One outcome line per practice request (UAT issue 11): the log trail could
 * show rejected questions and label errors but no per-request result, so a
 * request that failed — or a client that gave up — left nothing behind.
 *
 * Every exit path logs exactly one line, in one fixed shape:
 *
 * [V1 Practice] outcome status=<http> code=<error code|ok> requested=<n>
 *   delivered=<n> adapter_calls=<n> checks=<n> rejected=<json counts>
 *   topics=<n> skipped=<n> type=<practice_type> verify=<bool> stream=<bool>
 *   ms=<total> retrieval_ms=<n> generate_ms=<n> label_ms=<n> aborted=<bool>
 *
 * No question text, no keys, no PII. `code` is the error code the JSON body
 * carries, or `ok` on success. Fields the request never reached are 0 (and
 * `type` is `-` when the body did not name one) so every line stays
 * parseable with the same keys.
 */
import type { RejectionReason } from "./types"

export interface PracticeOutcome {
  status: number
  code: string
  requested: number
  delivered: number
  adapterCalls: number
  checks: number
  rejected: Record<RejectionReason, number>
  topics: number
  skipped: number
  type: string
  verify: boolean
  stream: boolean
  ms: number
  retrievalMs: number
  generateMs: number
  labelMs: number
  aborted: boolean
}

/** The zeroed rejection record, so every outcome line has the same keys. */
export function emptyRejections(): Record<RejectionReason, number> {
  return { format: 0, key_unsupported: 0, twin_keys: 0, ambiguous: 0, ai_checker: 0, duplicate: 0 }
}

export function logPracticeOutcome(o: PracticeOutcome): void {
  console.info(
    `[V1 Practice] outcome status=${o.status} code=${o.code} requested=${o.requested} delivered=${o.delivered} ` +
      `adapter_calls=${o.adapterCalls} checks=${o.checks} rejected=${JSON.stringify(o.rejected)} ` +
      `topics=${o.topics} skipped=${o.skipped} type=${o.type} verify=${o.verify} stream=${o.stream} ms=${o.ms} ` +
      `retrieval_ms=${o.retrievalMs} generate_ms=${o.generateMs} label_ms=${o.labelMs} aborted=${o.aborted}`,
  )
}

const OUTCOME_LOGGED = Symbol("practiceOutcomeLogged")

/**
 * Mark a thrown error as already outcome-logged (the service measured the
 * stages, the route only converts it to the 500 response), so the route's
 * catch does not log a second line for the same request.
 */
export function markOutcomeLogged(err: unknown): void {
  if (typeof err === "object" && err !== null) (err as Record<symbol, boolean>)[OUTCOME_LOGGED] = true
}

export function isOutcomeLogged(err: unknown): boolean {
  return typeof err === "object" && err !== null && Boolean((err as Record<symbol, boolean>)[OUTCOME_LOGGED])
}
