// @vitest-environment node
import { describe, it, expect } from "vitest"
import { formatChatTitle } from "@/features/conversations/components/chat/chat-title"

describe("formatChatTitle", () => {
  it("returns the content unchanged when shorter than the 50-char cutoff", () => {
    expect(formatChatTitle("hello")).toBe("hello")
    expect(formatChatTitle("")).toBe("")
  })

  it("returns the first 50 chars when content is exactly 50 chars", () => {
    const s = "a".repeat(50)
    expect(formatChatTitle(s)).toBe(s)
  })

  it("truncates to 50 chars and appends an ellipsis when content is longer than 50 chars", () => {
    const s = "a".repeat(60)
    expect(formatChatTitle(s)).toBe("a".repeat(50) + "...")
  })
})