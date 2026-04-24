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
// @fonts: Fraunces:wght@300..900 | Inter:wght@400;500;700
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
// @fonts:   Fraunces:wght@300..900  |  Inter:wght@400;500;700
export default () => null`
    const result = parseDirectives(code)
    expect(result.fonts).toEqual([
      "Fraunces:wght@300..900",
      "Inter:wght@400;500;700",
    ])
  })
})

import {
  validateFontSpec,
  buildFontLinks,
} from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"

describe("validateFontSpec", () => {
  it("accepts wght-only specs", () => {
    expect(validateFontSpec("Inter:wght@400;500;700")).toBe(true)
  })

  it("accepts italic+wght specs", () => {
    expect(validateFontSpec("Fraunces:ital,wght@0,400;1,700")).toBe(true)
  })

  it("accepts opsz+wght specs", () => {
    expect(validateFontSpec("Fraunces:opsz,wght@9..144,300..700")).toBe(true)
  })

  it("accepts full ital+opsz+wght specs", () => {
    expect(
      validateFontSpec(
        "Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900"
      )
    ).toBe(true)
  })

  it("rejects malformed specs", () => {
    expect(validateFontSpec("Inter")).toBe(false)
    expect(validateFontSpec("Inter:")).toBe(false)
    expect(validateFontSpec("Inter@400")).toBe(false)
    expect(validateFontSpec("lowercase:wght@400")).toBe(false)
    expect(validateFontSpec("Bad<name>:wght@400")).toBe(false)
  })

  it("rejects specs with URL injection attempts", () => {
    expect(validateFontSpec("Inter:wght@400&callback=http://evil")).toBe(false)
    expect(validateFontSpec("../../etc:wght@400")).toBe(false)
  })
})

describe("buildFontLinks", () => {
  it("uses direction defaults when fonts=null", () => {
    const links = buildFontLinks("editorial", null)
    expect(links).toContain("https://fonts.googleapis.com/css2?")
    expect(links).toContain("Fraunces")
    expect(links).toContain("Inter")
  })

  it("uses parsed specs when fonts provided", () => {
    const links = buildFontLinks("editorial", [
      "Playfair Display:wght@400;700",
      "Lora:wght@400;500",
    ])
    expect(links).toContain("Playfair")
    expect(links).toContain("Lora")
    expect(links).not.toContain("Fraunces")
  })

  it("falls back to direction defaults when any spec is malformed", () => {
    const links = buildFontLinks("editorial", ["Bad<name>:wght@400"])
    expect(links).toContain("Fraunces")
    expect(links).not.toContain("Bad")
  })

  it("caps at MAX_FONT_FAMILIES families", () => {
    const tooMany = [
      "Inter:wght@400",
      "Lora:wght@400",
      "Roboto:wght@400",
      "Poppins:wght@400",
    ]
    const links = buildFontLinks("editorial", tooMany)
    // Falls back to direction default because cap exceeded
    expect(links).toContain("Fraunces")
  })

  it("emits preconnect + stylesheet links", () => {
    const links = buildFontLinks("industrial", null)
    expect(links).toContain('rel="preconnect"')
    expect(links).toContain('href="https://fonts.googleapis.com"')
    expect(links).toContain('href="https://fonts.gstatic.com"')
    expect(links).toContain('rel="stylesheet"')
  })

  it("uses display=swap for all families", () => {
    expect(buildFontLinks("luxury", null)).toContain("display=swap")
  })

  it("URL-encodes family names with spaces", () => {
    const links = buildFontLinks("brutalist", null)
    expect(links).toContain("Space+Grotesk")
  })
})
