// @vitest-environment node
import { describe, it, expect, vi } from "vitest"
import {
  requiresRegenerateConfirmation,
  executeRegenerate,
} from "@/features/conversations/components/chat/regenerate-guards"

describe("requiresRegenerateConfirmation", () => {
  // Minimal typed shape — the helper only reads `id` and `role`, so anything
  // structurally compatible passes. Using a thin local type keeps the test
  // from drifting if `ChatMessage` evolves.
  type Msg = { id: string; role: "user" | "assistant" }

  it("returns true when the target assistant message has messages after it", () => {
    const messages: Msg[] = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "u2", role: "user" },
      { id: "a2", role: "assistant" },
    ]
    // a1 is mid-conversation; regenerating it would drop u2 and a2
    expect(requiresRegenerateConfirmation(messages, "a1")).toBe(true)
  })

  it("returns false when the target assistant message is the last message", () => {
    const messages: Msg[] = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
    ]
    expect(requiresRegenerateConfirmation(messages, "a1")).toBe(false)
  })

  it("returns false for an unknown assistant id (never requires confirmation for a no-op)", () => {
    const messages: Msg[] = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "u2", role: "user" },
    ]
    expect(requiresRegenerateConfirmation(messages, "missing")).toBe(false)
  })

  it("returns false when the target id points at a user message", () => {
    const messages: Msg[] = [
      { id: "u1", role: "user" },
      { id: "a1", role: "assistant" },
      { id: "u2", role: "user" },
    ]
    // handleRegenerate never proceeds on a non-assistant target anyway;
    // confirmation logic must not trip on that path.
    expect(requiresRegenerateConfirmation(messages, "u2")).toBe(false)
  })
})

describe("executeRegenerate", () => {
  type Msg = { id: string; role: "user" | "assistant"; content?: string; replyTo?: string }

  const getContent = (m: { content?: string }) => m.content ?? ""

  it("re-sends the preceding user message with everything before it as base context", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const messages: Msg[] = [
      { id: "u1", role: "user", content: "hi" },
      { id: "a1", role: "assistant", content: "hello" },
      { id: "u2", role: "user", content: "follow-up" },
      { id: "a2", role: "assistant", content: "answer" },
    ]
    await executeRegenerate(messages, "a1", sendMessage, getContent)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    // u1 content + no base (u1 is the very first message) + no replyTo.
    expect(sendMessage).toHaveBeenCalledWith("hi", [], undefined)
  })

  it("returns undefined and skips sendMessage for an unknown assistant id", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const messages: Msg[] = [
      { id: "u1", role: "user", content: "hi" },
      { id: "a1", role: "assistant", content: "hello" },
    ]
    const result = executeRegenerate(messages, "missing", sendMessage, getContent)
    expect(result).toBeUndefined()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it("returns undefined when the target id points at a user message", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const messages: Msg[] = [
      { id: "u1", role: "user", content: "hi" },
      { id: "a1", role: "assistant", content: "hello" },
    ]
    const result = executeRegenerate(messages, "u1", sendMessage, getContent)
    expect(result).toBeUndefined()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it("forwards the preceding user's replyTo when present", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined)
    const messages: Msg[] = [
      { id: "p1", role: "user", content: "parent" },
      { id: "u1", role: "user", content: "reply", replyTo: "p1" },
      { id: "a1", role: "assistant", content: "answer" },
    ]
    await executeRegenerate(messages, "a1", sendMessage, getContent)
    expect(sendMessage).toHaveBeenCalledWith("reply", [messages[0]], "p1")
  })
})