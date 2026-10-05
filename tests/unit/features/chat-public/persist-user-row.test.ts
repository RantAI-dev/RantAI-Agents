// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  buildPersistedUserRow,
  sanitizeEditHistory,
} from "@/features/chat-public/service"

describe("sanitizeEditHistory", () => {
  it("returns null for non-array input (defensive: row builder never throws)", () => {
    expect(sanitizeEditHistory(undefined)).toBeNull()
    expect(sanitizeEditHistory(null)).toBeNull()
    expect(sanitizeEditHistory("not an array")).toBeNull()
    expect(sanitizeEditHistory(42)).toBeNull()
  })

  it("drops entries that are not plain objects", () => {
    const out = sanitizeEditHistory([
      { content: "ok", editedAt: "2026-01-01T00:00:00.000Z" },
      null,
      "string entry",
      123,
      { content: "also ok", assistantResponse: "y", editedAt: "2026-01-02T00:00:00.000Z" },
    ])
    expect(out).toEqual([
      { content: "ok", editedAt: "2026-01-01T00:00:00.000Z" },
      { content: "also ok", assistantResponse: "y", editedAt: "2026-01-02T00:00:00.000Z" },
    ])
  })

  it("coerces editedAt to ISO string when given a Date", () => {
    const d = new Date("2026-03-01T00:00:00.000Z")
    const out = sanitizeEditHistory([
      { content: "hi", editedAt: d },
    ])
    expect(out?.[0]?.editedAt).toBe("2026-03-01T00:00:00.000Z")
  })

  it("keeps only string content and trims the assistantResponse when missing", () => {
    const out = sanitizeEditHistory([
      { content: 42, editedAt: "x" },
      { content: "ok", assistantResponse: "reply", editedAt: "y" },
    ])
    expect(out).toEqual([{ content: "ok", assistantResponse: "reply", editedAt: "y" }])
  })
})

describe("buildPersistedUserRow", () => {
  const baseMsg = {
    id: "u1",
    role: "user" as const,
    content: "hello",
  }

  it("returns the base row when no edit history or replyTo is provided", () => {
    const row = buildPersistedUserRow({
      message: baseMsg,
      sessionId: "s1",
    })
    expect(row).toEqual({
      id: "u1",
      sessionId: "s1",
      role: "user",
      content: "hello",
    })
    // editHistory / replyTo must not appear as undefined keys — Prisma's
    // update path leaves undefined fields untouched, so an explicit `undefined`
    // would silently re-clear any previous value.
    expect("editHistory" in row).toBe(false)
    expect("replyTo" in row).toBe(false)
  })

  it("includes replyTo when present and a string", () => {
    const row = buildPersistedUserRow({
      message: { ...baseMsg, replyTo: "p1" },
      sessionId: "s1",
    })
    expect(row).toEqual({
      id: "u1",
      sessionId: "s1",
      role: "user",
      content: "hello",
      replyTo: "p1",
    })
  })

  it("drops replyTo when it is not a string (defensive: don't write junk to the DB)", () => {
    const row = buildPersistedUserRow({
      message: { ...baseMsg, replyTo: 42 as unknown as string },
      sessionId: "s1",
    })
    expect("replyTo" in row).toBe(false)
  })

  it("includes sanitized editHistory when present and non-empty", () => {
    const row = buildPersistedUserRow({
      message: {
        ...baseMsg,
        editHistory: [
          { content: "v1", assistantResponse: "r1", editedAt: "2026-01-01T00:00:00.000Z" },
        ],
      },
      sessionId: "s1",
    })
    expect(row.editHistory).toEqual([
      { content: "v1", assistantResponse: "r1", editedAt: "2026-01-01T00:00:00.000Z" },
    ])
  })

  it("omits editHistory when the sanitized result is empty", () => {
    const row = buildPersistedUserRow({
      message: {
        ...baseMsg,
        editHistory: [null, "x", 42] as unknown as Array<{
          content: string
          assistantResponse?: string
          editedAt: string
        }>,
      },
      sessionId: "s1",
    })
    expect("editHistory" in row).toBe(false)
  })
})