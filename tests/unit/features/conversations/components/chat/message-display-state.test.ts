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
})
