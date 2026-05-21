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
})
