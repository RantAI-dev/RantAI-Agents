// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  accumulatePendingDeletes,
  computeRemovedMessageIds,
  filterDeletedSessions,
  getSessionActivityDate,
  hasNewMessageIds,
  moveSessionToTop,
  selectMessageIdsToDelete,
  type SessionActivityLike,
} from "@/features/conversations/sessions/session-sync"

describe("known-and-removed message diffing", () => {
  it("returns only ids the client held before and dropped now", () => {
    expect(computeRemovedMessageIds(["a", "b", "c", "d"], ["a", "b"])).toEqual(["c", "d"])
  })

  it("positive control: nothing removed when the list only grows", () => {
    expect(computeRemovedMessageIds(["a", "b"], ["a", "b", "c", "d"])).toEqual([])
  })

  it("never deletes server-only ids the client never held (partial local list)", () => {
    // Client knows [c, d] (history not loaded yet); the server has a..d.
    const pending = accumulatePendingDeletes(new Set(), ["c", "d"], ["c", "d", "e"])
    expect(selectMessageIdsToDelete(pending, new Set(["a", "b", "c", "d"]), ["c", "d", "e"])).toEqual([])
  })

  it("accumulates removals across debounced calls", () => {
    // delete "d" → then send a new turn before the debounce flushes
    let pending = accumulatePendingDeletes(new Set(), ["a", "b", "c", "d"], ["a", "b", "c"])
    pending = accumulatePendingDeletes(pending, ["a", "b", "c"], ["a", "b", "c", "x", "y"])
    expect(selectMessageIdsToDelete(pending, new Set(["a", "b", "c", "d"]), ["a", "b", "c", "x", "y"]))
      .toEqual(["d"])
  })

  it("edit truncation: the old user turn and its reply are deleted, the new turn is kept", () => {
    const before = ["u1", "a1", "u2", "a2"]
    const after = ["u1", "a1", "u2b", "a2b"]
    const pending = accumulatePendingDeletes(new Set(), before, after)
    expect(selectMessageIdsToDelete(pending, new Set(before), after).sort()).toEqual(["a2", "u2"])
  })

  it("drops an id from pending when a later list brings it back (rollback)", () => {
    let pending = accumulatePendingDeletes(new Set(), ["a", "b"], ["a"])
    pending = accumulatePendingDeletes(pending, ["a"], ["a", "b"])
    expect(pending.has("b")).toBe(false)
    expect(selectMessageIdsToDelete(pending, new Set(["a", "b"]), ["a", "b"])).toEqual([])
  })

  it("skips pending ids the server does not have (yet), but keeps them pending", () => {
    const pending = accumulatePendingDeletes(new Set(), ["a", "b"], ["a"])
    expect(selectMessageIdsToDelete(pending, new Set(["a"]), ["a"])).toEqual([])
    expect(pending.has("b")).toBe(true)
    // …and deletes it once the server has it (stream-end persist landed late).
    expect(selectMessageIdsToDelete(pending, new Set(["a", "b"]), ["a"])).toEqual(["b"])
  })
})

describe("session activity ordering", () => {
  const t0 = new Date("2026-01-01T00:00:00Z")
  const sessions: SessionActivityLike[] = [
    { id: "s1", createdAt: t0 },
    { id: "s2", createdAt: t0 },
    { id: "s3", createdAt: t0 },
  ]

  it("hasNewMessageIds detects a sent message", () => {
    expect(hasNewMessageIds(["a"], ["a", "b"])).toBe(true)
  })

  it("positive control: a delete/truncate is not new activity", () => {
    expect(hasNewMessageIds(["a", "b"], ["a"])).toBe(false)
  })

  it("moves the active session to the top and stamps updatedAt", () => {
    const now = new Date("2026-02-01T00:00:00Z")
    const result = moveSessionToTop(sessions, "s3", now)
    expect(result.map((s) => s.id)).toEqual(["s3", "s1", "s2"])
    expect(result[0].updatedAt).toEqual(now)
  })

  it("leaves the list untouched for an unknown session", () => {
    expect(moveSessionToTop(sessions, "nope", new Date())).toBe(sessions)
  })

  it("prefers updatedAt over createdAt for display", () => {
    const later = new Date("2026-03-01T00:00:00Z")
    expect(getSessionActivityDate({ id: "x", createdAt: t0, updatedAt: later })).toBe(later)
    expect(getSessionActivityDate({ id: "x", createdAt: t0 })).toBe(t0)
  })
})

describe("filterDeletedSessions", () => {
  it("drops sessions deleted in this tab from a (stale) hydration payload", () => {
    const incoming = [{ id: "a" }, { id: "b" }, { id: "c", dbId: "c-db" }]
    expect(filterDeletedSessions(incoming, new Set(["b", "c-db"])).map((s) => s.id)).toEqual(["a"])
  })

  it("positive control: keeps everything when nothing was deleted", () => {
    const incoming = [{ id: "a" }, { id: "b" }]
    expect(filterDeletedSessions(incoming, new Set())).toEqual(incoming)
  })
})
