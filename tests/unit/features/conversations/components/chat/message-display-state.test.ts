// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  getMessageDisplayState,
  type MessageDisplayInput,
} from "@/features/conversations/components/chat/message-display-state"

/** Build a valid input with sensible defaults so each test only overrides
 *  the fields it cares about. */
function input(overrides: Partial<MessageDisplayInput> = {}): MessageDisplayInput {
  return {
    isLoading: false,
    isLastMessage: true,
    role: "assistant",
    content: "",
    parts: undefined,
    metadata: undefined,
    ...overrides,
  }
}

describe("getMessageDisplayState", () => {
  it("returns showTypingIndicator=true for a streaming assistant message with nothing in it", () => {
    const result = getMessageDisplayState(input({ isLoading: true }))
    expect(result.showTypingIndicator).toBe(true)
  })

  it("hides the typing indicator when a tool invocation is present, even with empty text content", () => {
    // This is the canvas-mode bug: model called create_artifact (parts has a
    // tool-invocation), so the artifact is already visible in the panel —
    // but content is still "" because canvas mode tells the model not to
    // produce inline text. The old isLoadingMessage check would keep the
    // typing indicator on forever; the new function flips it off.
    const result = getMessageDisplayState(
      input({
        isLoading: true,
        content: "",
        parts: [
          { type: "tool-invocation", state: "call" },
        ],
      })
    )
    expect(result.showTypingIndicator).toBe(false)
    expect(result.showFooter).toBe(true)
  })

  it("hides the typing indicator when reasoning has started, even with empty content and no parts", () => {
    // The old code suppressed TypingIndicator inline with a string-length
    // check on metadata.reasoning, so the ReasoningBox's own pulsing
    // 'Thinking…' header would be the single source of truth. New function
    // handles it cleanly without the JSX needing to know.
    const result = getMessageDisplayState(
      input({
        isLoading: true,
        metadata: { reasoning: "Let me think about this..." },
      })
    )
    expect(result.showTypingIndicator).toBe(false)
  })

  it("treats non-string reasoning metadata as 'no reasoning'", () => {
    const result = getMessageDisplayState(
      input({
        isLoading: true,
        // Defensive: metadata.reasoning is loosely typed via Prisma.JsonValue
        // upstream. A non-string here must not bypass the typing indicator.
        metadata: { reasoning: 42 as unknown as string },
      })
    )
    expect(result.showTypingIndicator).toBe(true)
  })

  it("never shows the indicator on a user message", () => {
    const result = getMessageDisplayState(input({ isLoading: true, role: "user" }))
    expect(result.showTypingIndicator).toBe(false)
  })

  it("never shows the indicator on a non-last assistant message", () => {
    const result = getMessageDisplayState(
      input({ isLoading: true, isLastMessage: false })
    )
    expect(result.showTypingIndicator).toBe(false)
  })

  it("hides the indicator once the stream has finished, even with empty content", () => {
    // Canvas mode: the LLM may legitimately end the stream with zero text
    // (it 'rendered to the artifact instead'). isLoading=false → done.
    const result = getMessageDisplayState(input({ isLoading: false, content: "" }))
    expect(result.showTypingIndicator).toBe(false)
    expect(result.showFooter).toBe(true)
  })

  it("hides the indicator once content has been streamed", () => {
    const result = getMessageDisplayState(
      input({ isLoading: true, content: "Hello" })
    )
    expect(result.showTypingIndicator).toBe(false)
  })

  it("turns the footer off precisely when the typing indicator is on", () => {
    const result = getMessageDisplayState(input({ isLoading: true }))
    expect(result.showFooter).toBe(false)
    expect(result.showSources).toBe(false)
  })

  it("treats every non-assistant role as 'show footer, no indicator'", () => {
    const result = getMessageDisplayState(
      input({ isLoading: true, role: "system" })
    )
    expect(result.showTypingIndicator).toBe(false)
    expect(result.showFooter).toBe(true)
    expect(result.showSources).toBe(false)
  })

  it("ignores non-tool-invocation parts when deciding 'bubble has output'", () => {
    // A `parts: [{ type: 'text', text: '' }]` array doesn't count as output
    // for indicator purposes — only tool-invocation parts do. Text content
    // comes through `content`.
    const result = getMessageDisplayState(
      input({
        isLoading: true,
        parts: [{ type: "text", text: "" }],
      })
    )
    expect(result.showTypingIndicator).toBe(true)
  })
})

describe("streaming caret / visible text (QA TC-783)", () => {
  it("keeps the typing indicator while only whitespace or markdown syntax has arrived", async () => {
    for (const content of ["\n", "  ", "**", "## ", "- ", "1. ", "```", "|"]) {
      expect(getMessageDisplayState(input({ isLoading: true, content })).showTypingIndicator).toBe(true)
    }
  })

  it("positive control: hides the typing indicator once readable text arrives", () => {
    expect(getMessageDisplayState(input({ isLoading: true, content: "**Hi" })).showTypingIndicator).toBe(false)
  })

  it("shows the caret only while streaming AND with visible text", async () => {
    const { shouldShowStreamingCaret } = await import(
      "@/features/conversations/components/chat/message-display-state"
    )
    expect(shouldShowStreamingCaret(true, "\n")).toBe(false)
    expect(shouldShowStreamingCaret(true, "**")).toBe(false)
    expect(shouldShowStreamingCaret(true, "Hello")).toBe(true)
    expect(shouldShowStreamingCaret(false, "Hello")).toBe(false)
  })

  it("animates without per-character stagger (bold runs no longer start invisible)", async () => {
    const { STREAMDOWN_ANIMATION } = await import(
      "@/features/conversations/components/chat/message-display-state"
    )
    expect(STREAMDOWN_ANIMATION.stagger).toBe(0)
  })
})
