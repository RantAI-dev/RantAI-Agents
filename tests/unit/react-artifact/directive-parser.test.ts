import { describe, it, expect } from "vitest"
import {
  AESTHETIC_DIRECTIONS,
  DEFAULT_FONTS_BY_DIRECTION,
  MAX_FONT_FAMILIES,
} from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"

describe("_react-directives — constants", () => {
  it("exposes exactly 7 aesthetic directions", () => {
    expect(AESTHETIC_DIRECTIONS).toHaveLength(7)
  })

  it("lists every expected direction by name", () => {
    expect(AESTHETIC_DIRECTIONS).toEqual([
      "editorial",
      "brutalist",
      "luxury",
      "playful",
      "industrial",
      "organic",
      "retro-futuristic",
    ])
  })

  it("has font defaults for every direction", () => {
    for (const dir of AESTHETIC_DIRECTIONS) {
      expect(DEFAULT_FONTS_BY_DIRECTION[dir]).toBeDefined()
      expect(DEFAULT_FONTS_BY_DIRECTION[dir].length).toBeGreaterThan(0)
      expect(DEFAULT_FONTS_BY_DIRECTION[dir].length).toBeLessThanOrEqual(MAX_FONT_FAMILIES)
    }
  })
})
