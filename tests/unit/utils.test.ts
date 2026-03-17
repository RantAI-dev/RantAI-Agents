import { describe, it, expect } from "vitest"
import { cn, getTagColor, TAG_COLORS } from "@/lib/utils"

// ─── cn (tailwind class merge) ────────────────────────────────────────────────

describe("cn", () => {
  it("merges multiple class strings", () => {
    const result = cn("flex", "items-center", "gap-4")
    expect(result).toBe("flex items-center gap-4")
  })

  it("resolves conflicting tailwind classes (last one wins)", () => {
    const result = cn("p-4", "p-2")
    expect(result).toBe("p-2")
  })

  it("applies conditional classes when condition is true", () => {
    const result = cn("base-class", true && "active-class")
    expect(result).toContain("base-class")
    expect(result).toContain("active-class")
  })

  it("omits conditional classes when condition is false", () => {
    const result = cn("base-class", false && "inactive-class")
    expect(result).toBe("base-class")
    expect(result).not.toContain("inactive-class")
  })

  it("handles empty input gracefully", () => {
    const result = cn()
    expect(result).toBe("")
  })

  it("filters out undefined and null values", () => {
    const result = cn("text-sm", undefined, null, "font-bold")
    expect(result).toBe("text-sm font-bold")
  })
})

// ─── getTagColor ──────────────────────────────────────────────────────────────

describe("getTagColor", () => {
  it("is deterministic — same tag always returns the same color", () => {
    const color1 = getTagColor("engineering")
    const color2 = getTagColor("engineering")
    expect(color1).toBe(color2)
  })

  it("returns a color that is part of the TAG_COLORS palette", () => {
    const color = getTagColor("design")
    expect(TAG_COLORS).toContain(color)
  })

  it("different tags produce different colors (variety in the palette)", () => {
    const tags = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"]
    const colors = tags.map(getTagColor)
    const unique = new Set(colors)
    // With 7 different tags and 14 colors in palette, expect at least 3 distinct colors
    expect(unique.size).toBeGreaterThanOrEqual(3)
  })

  it("works for single-character tags", () => {
    const color = getTagColor("a")
    expect(TAG_COLORS).toContain(color)
  })

  it("works for empty string tag", () => {
    // Empty string hash = 0, so index 0 in TAG_COLORS
    const color = getTagColor("")
    expect(TAG_COLORS).toContain(color)
  })
})
