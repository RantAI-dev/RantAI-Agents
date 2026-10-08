/**
 * Unit tests for the v1 chat input limits.
 *
 * Without a limit an oversized message does not fail loudly. It eats the prompt
 * budget, so retrieved excerpts are trimmed to make room and the answer quietly
 * loses its grounding; past the model's context window the upstream rejects the
 * call and the client sees a 500. Both are worse than a 400 that says why.
 *
 * The limits are off unless configured, so an existing deployment keeps its
 * behaviour byte for byte.
 */
import { describe, it, expect } from "vitest"
import { inputLimits, applyInputLimits } from "@/features/agent-api/limits"

const u = (content: string) => ({ role: "user" as const, content })
const a = (content: string) => ({ role: "assistant" as const, content })
const s = (content: string) => ({ role: "system" as const, content })

describe("inputLimits", () => {
  it("is off when nothing is configured", () => {
    expect(inputLimits({} as NodeJS.ProcessEnv)).toEqual({ maxUserMessageChars: null, maxHistoryMessages: null })
  })

  it("reads both limits from the environment", () => {
    const env = { AGENT_API_MAX_USER_MESSAGE_CHARS: "2000", AGENT_API_MAX_HISTORY_MESSAGES: "20" }
    expect(inputLimits(env as NodeJS.ProcessEnv)).toEqual({ maxUserMessageChars: 2000, maxHistoryMessages: 20 })
  })

  it("treats zero, negatives and junk as no limit rather than a limit of zero", () => {
    // A limit of 0 would reject every request; a typo must not take the API down.
    for (const v of ["0", "-5", "abc", "", "1.5"]) {
      const env = { AGENT_API_MAX_USER_MESSAGE_CHARS: v, AGENT_API_MAX_HISTORY_MESSAGES: v }
      expect(inputLimits(env as NodeJS.ProcessEnv)).toEqual({ maxUserMessageChars: null, maxHistoryMessages: null })
    }
  })
})

describe("applyInputLimits", () => {
  const none = { maxUserMessageChars: null, maxHistoryMessages: null }

  it("passes messages through untouched when no limit is set", () => {
    const msgs = [u("x".repeat(50_000)), a("ok"), u("lagi")]
    expect(applyInputLimits(msgs, none)).toEqual({ messages: msgs })
  })

  it("accepts a user message exactly at the limit", () => {
    const msgs = [u("x".repeat(100))]
    expect(applyInputLimits(msgs, { ...none, maxUserMessageChars: 100 })).toEqual({ messages: msgs })
  })

  it("rejects a user message one character over, and says by how much", () => {
    const r = applyInputLimits([u("x".repeat(101))], { ...none, maxUserMessageChars: 100 })
    expect(r).toEqual({ error: expect.stringContaining("101"), code: "message_too_long" })
    expect((r as { error: string }).error).toContain("100")
  })

  it("rejects an oversized user message anywhere in the history, not only the last", () => {
    const r = applyInputLimits([u("x".repeat(500)), a("ok"), u("pendek")], { ...none, maxUserMessageChars: 100 })
    expect("error" in r).toBe(true)
  })

  it("does not hold the assistant's own long answers against the caller", () => {
    // History is replayed by the client. An answer we wrote ourselves, longer
    // than the user limit, must not make the next turn fail.
    const msgs = [u("apa itu fotosintesis?"), a("y".repeat(5000)), u("lanjut")]
    expect(applyInputLimits(msgs, { ...none, maxUserMessageChars: 100 })).toEqual({ messages: msgs })
  })

  it("counts characters, not bytes, so non-Latin text is not penalised", () => {
    expect("error" in applyInputLimits([u("é".repeat(100))], { ...none, maxUserMessageChars: 100 })).toBe(false)
  })

  it("keeps only the most recent turns when history is capped", () => {
    const msgs = [u("1"), a("2"), u("3"), a("4"), u("5")]
    expect(applyInputLimits(msgs, { ...none, maxHistoryMessages: 3 })).toEqual({ messages: [u("3"), a("4"), u("5")] })
  })

  it("never starts the kept history on an assistant turn", () => {
    // Chat templates that require strict user/assistant alternation (Gemma)
    // reject a conversation that opens with the assistant. Cutting at an even
    // count would land there, so the orphaned answer is dropped as well.
    const msgs = [u("1"), a("2"), u("3"), a("4"), u("5")]
    expect(applyInputLimits(msgs, { ...none, maxHistoryMessages: 4 })).toEqual({ messages: [u("3"), a("4"), u("5")] })
  })

  it("keeps system messages regardless of the history cap", () => {
    const msgs = [s("aturan"), u("1"), a("2"), u("3")]
    expect(applyInputLimits(msgs, { ...none, maxHistoryMessages: 1 })).toEqual({ messages: [s("aturan"), u("3")] })
  })

  it("always keeps the latest user message, even with a cap of one", () => {
    const msgs = [u("1"), a("2"), u("terakhir")]
    const r = applyInputLimits(msgs, { ...none, maxHistoryMessages: 1 })
    expect(r).toEqual({ messages: [u("terakhir")] })
  })
})
