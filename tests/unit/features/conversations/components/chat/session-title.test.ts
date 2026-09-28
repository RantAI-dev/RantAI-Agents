// @vitest-environment node
import { describe, it, expect } from "vitest"
import { normalizeSessionTitleInput } from "@/features/conversations/components/chat/session-title"

describe("normalizeSessionTitleInput", () => {
  it("returns the trimmed, whitespace-collapsed title", () => {
    expect(normalizeSessionTitleInput("  Trip   plan \n", "Old")).toBe("Trip plan")
  })

  it("ignores empty / whitespace-only input", () => {
    expect(normalizeSessionTitleInput("   ", "Old")).toBeNull()
  })

  it("ignores an unchanged title", () => {
    expect(normalizeSessionTitleInput("Old ", "Old")).toBeNull()
  })

  it("caps the length", () => {
    expect(normalizeSessionTitleInput("x".repeat(500), "Old")?.length).toBe(200)
  })
})
