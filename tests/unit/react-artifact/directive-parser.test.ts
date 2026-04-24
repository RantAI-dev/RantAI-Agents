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

import { parseDirectives } from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"

describe("parseDirectives — aesthetic extraction", () => {
  it("extracts @aesthetic from line 1", () => {
    const code = `// @aesthetic: editorial
function App() { return null }
export default App`
    const result = parseDirectives(code)
    expect(result.aesthetic).toBe("editorial")
    expect(result.rawAestheticLine).toBe("// @aesthetic: editorial")
  })

  it("accepts all 7 valid direction names", () => {
    for (const dir of ["editorial", "brutalist", "luxury", "playful", "industrial", "organic", "retro-futuristic"]) {
      const code = `// @aesthetic: ${dir}\nexport default () => null`
      expect(parseDirectives(code).aesthetic).toBe(dir)
    }
  })

  it("returns aesthetic=null for unknown direction", () => {
    const code = `// @aesthetic: nonsense
export default () => null`
    const result = parseDirectives(code)
    expect(result.aesthetic).toBeNull()
    expect(result.rawAestheticLine).toBe("// @aesthetic: nonsense")
  })

  it("returns aesthetic=null when directive missing", () => {
    const code = `function App() { return null }\nexport default App`
    expect(parseDirectives(code).aesthetic).toBeNull()
  })

  it("tolerates leading whitespace before //", () => {
    const code = `   // @aesthetic: luxury\nexport default () => null`
    expect(parseDirectives(code).aesthetic).toBe("luxury")
  })

  it("tolerates extra whitespace around the value", () => {
    const code = `//   @aesthetic:    brutalist   \nexport default () => null`
    expect(parseDirectives(code).aesthetic).toBe("brutalist")
  })

  it("ignores @aesthetic not on line 1", () => {
    const code = `// some preamble\n// @aesthetic: editorial\nexport default () => null`
    expect(parseDirectives(code).aesthetic).toBeNull()
  })
})

describe("parseDirectives — fonts extraction", () => {
  it("extracts @fonts from line 2", () => {
    const code = `// @aesthetic: editorial
// @fonts: Fraunces:wght@300..900, Inter:wght@400;500;700
export default () => null`
    const result = parseDirectives(code)
    expect(result.fonts).toEqual([
      "Fraunces:wght@300..900",
      "Inter:wght@400;500;700",
    ])
  })

  it("returns fonts=null when directive missing", () => {
    const code = `// @aesthetic: editorial\nexport default () => null`
    expect(parseDirectives(code).fonts).toBeNull()
  })

  it("returns fonts=null when @fonts is not on line 2", () => {
    const code = `// @aesthetic: editorial
function App() { return null }
// @fonts: Fraunces:wght@300..900
export default App`
    expect(parseDirectives(code).fonts).toBeNull()
  })

  it("trims whitespace from each family spec", () => {
    const code = `// @aesthetic: editorial
// @fonts:   Fraunces:wght@300..900  ,  Inter:wght@400;500;700
export default () => null`
    const result = parseDirectives(code)
    expect(result.fonts).toEqual([
      "Fraunces:wght@300..900",
      "Inter:wght@400;500;700",
    ])
  })
})
