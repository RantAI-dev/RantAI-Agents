/**
 * Unit tests for the chunk-write retry classifier.
 *
 * The bug these guard against cost a whole textbook: SurrealDB's driver
 * surfaces `ResponseError` with no message under concurrent writes, the
 * classifier tested that empty message against its "read or write conflict"
 * patterns, found nothing, declared the error permanent, and aborted an ingest
 * whose sibling retries were succeeding. The document finished with 0 chunks
 * and the job was marked failed.
 *
 * The classifier is not exported (it is an implementation detail of
 * storeChunks), so these tests exercise it through the same predicate shape it
 * uses. Keep the two in sync: this file documents the contract.
 */
import { describe, it, expect } from "vitest"

/** Mirror of vector-store.ts's classifier — see the note above. */
const TRANSIENT_CONFLICT_PATTERNS: readonly RegExp[] = [
  /failed to commit transaction/i,
  /read or write conflict/i,
  /can be retried/i,
]

function isTransientConflict(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (TRANSIENT_CONFLICT_PATTERNS.some((p) => p.test(err.message))) return true
  const name = (err as { name?: string }).name ?? ""
  const msg = (err.message ?? "").trim()
  return (!msg || msg === "undefined") && /response|surreal|query/i.test(`${name}`)
}

const named = (name: string, message = "") => {
  const e = new Error(message)
  e.name = name
  return e
}

describe("isTransientConflict", () => {
  it("recognises the conflict SurrealDB names explicitly", () => {
    expect(
      isTransientConflict(
        new Error(
          "The query was not executed due to a failed transaction. Failed to commit transaction due to a read or write conflict. This transaction can be retried",
        ),
      ),
    ).toBe(true)
  })

  it("recognises a message-less ResponseError — the case that killed an ingest", () => {
    expect(isTransientConflict(named("ResponseError"))).toBe(true)
    expect(isTransientConflict(named("ResponseError", "undefined"))).toBe(true)
    expect(isTransientConflict(named("ResponseError", "   "))).toBe(true)
  })

  it("does not retry a genuine schema or data error", () => {
    // These are permanent: retrying wastes the budget and hides the cause.
    expect(
      isTransientConflict(named("ResponseError", "Found NULL for field content, but expected a string")),
    ).toBe(false)
    expect(isTransientConflict(new Error("Database record already exists"))).toBe(false)
    expect(isTransientConflict(named("TypeError", ""))).toBe(false)
  })

  it("ignores non-Errors rather than treating them as retryable", () => {
    expect(isTransientConflict("boom")).toBe(false)
    expect(isTransientConflict(null)).toBe(false)
    expect(isTransientConflict({ message: "read or write conflict" })).toBe(false)
  })
})
