# React Quality Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the "AI-slop dashboard" default in `application/react` artifacts by introducing a 7-direction aesthetic menu, line-comment directives (`// @aesthetic:`, `// @fonts:`) that the renderer parses for dynamic Google Fonts injection, and validator updates that hard-enforce direction commitment while soft-warning on palette-direction mismatch.

**Architecture:** A new `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts` module owns directive parsing, the aesthetic-direction vocabulary, font defaults per direction, and the Google Fonts link builder. `react-renderer.tsx` integrates the parser into `preprocessCode` and threads parsed directives into `buildSrcdoc` to replace the hard-coded Inter `<link>`. `validateReact` in `_validate-artifact.ts` grows a directive-validation branch plus three soft-warn heuristics. The `react.ts` prompt is rewritten end-to-end: replaces the single "slate+indigo dashboard" design system with 7 direction-specific design systems, a selection heuristic, directive syntax spec, and four full examples covering four different directions. Seven fixture artifacts under `tests/fixtures/react-artifacts/` (one per direction) serve as regression tests.

**Tech Stack:** Next.js 15, React 18, TypeScript, Babel standalone (client-side transpile), Vitest, Tailwind CSS. Zero new npm dependencies. Zero new server-side runtime deps. One new env flag (`ARTIFACT_REACT_AESTHETIC_REQUIRED`) for rollback.

**Design doc:** [`docs/artifact-plans/2026-04-24-react-quality-upgrade-design.md`](./2026-04-24-react-quality-upgrade-design.md) — read first.

**Package manager:** bun. All test commands use `bun`, never `npm`.

---

## File Structure

### New files

- `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts` — directive constants, types, parser, font-link builder
- `tests/unit/react-artifact/directive-parser.test.ts` — unit tests for `_react-directives.ts`
- `tests/fixtures/react-artifacts/aesthetic-editorial.tsx` — editorial direction fixture
- `tests/fixtures/react-artifacts/aesthetic-brutalist.tsx` — brutalist direction fixture
- `tests/fixtures/react-artifacts/aesthetic-luxury.tsx` — luxury direction fixture
- `tests/fixtures/react-artifacts/aesthetic-playful.tsx` — playful direction fixture
- `tests/fixtures/react-artifacts/aesthetic-industrial.tsx` — industrial direction fixture
- `tests/fixtures/react-artifacts/aesthetic-organic.tsx` — organic direction fixture
- `tests/fixtures/react-artifacts/aesthetic-retro-futuristic.tsx` — retro-futuristic direction fixture
- `tests/unit/react-artifact/fixtures.test.ts` — roundtrip test: every fixture parses + validates + produces srcdoc

### Modified files

- `src/lib/prompts/artifacts/react.ts` — full `rules` rewrite + 4 new `examples`
- `src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx` — `preprocessCode` threads directives, `buildSrcdoc` takes directive params, dynamic `<link>` injection replaces hard-coded Inter
- `src/lib/tools/builtin/_validate-artifact.ts` — `validateReact` gains directive checks + 3 soft-warn heuristics
- `tests/unit/validate-artifact.test.ts` — add `validateReact — aesthetic directive` suite + soft-warn suites
- `docs/artifact-plans/artifacts-capabilities.md` — update section 2 (React) with aesthetic menu, directive syntax, font freedom
- `.env.example` (if present; otherwise create) — document `ARTIFACT_REACT_AESTHETIC_REQUIRED` flag

### Responsibility boundaries

- **`_react-directives.ts`** owns directive grammar. Exports: `AESTHETIC_DIRECTIONS` (const tuple), `AestheticDirection` (type), `DEFAULT_FONTS_BY_DIRECTION` (map), `parseDirectives(code)` (pure), `validateFontSpec(spec)` (pure), `buildFontLinks(aesthetic, fonts)` (pure). No DOM. No React. No imports from `react-renderer.tsx`.
- **`react-renderer.tsx`** consumes `_react-directives.ts`. Never defines directive logic inline.
- **`_validate-artifact.ts`** imports `AESTHETIC_DIRECTIONS` + `validateFontSpec` from `_react-directives.ts` for consistency with the renderer. Never duplicates the whitelist.
- **Fixture files** are the executable reference. If the prompt, parser, or validator drift, a fixture regression catches it first.

---

## Phasing

Six independently mergeable slices. Each phase ends on a commit and leaves `main` in a shippable state.

- **Phase 1 (Tasks 1–3):** Directive module in isolation — types, parser, font-link builder. Pure functions, fully unit-tested. No integration with renderer or validator yet.
- **Phase 2 (Tasks 4–5):** `validateReact` gains directive hard-errors + soft-warn heuristics. Validator tests pass. Renderer still uses hard-coded Inter (no user-visible change yet).
- **Phase 3 (Tasks 6–7):** `react-renderer.tsx` wires the parser + dynamic font injection. User-visible change: artifacts with directives now load their declared fonts.
- **Phase 4 (Tasks 8–9):** `react.ts` prompt rewritten. LLM begins emitting directives + direction-appropriate code.
- **Phase 5 (Tasks 10–12):** 7 fixture artifacts + roundtrip regression test. Proves every direction renders cleanly.
- **Phase 6 (Tasks 13–14):** Capabilities doc updated. Rollback env flag wired.

---

## Phase 1 — Directive Module

### Task 1: Scaffold `_react-directives.ts` with types and constants

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`
- Create: `tests/unit/react-artifact/` (directory)

- [ ] **Step 1: Create the test directory**

Run:
```bash
cd /home/shiro/rantai/RantAI-Agents
mkdir -p tests/unit/react-artifact
```

- [ ] **Step 2: Write the full `_react-directives.ts` scaffold**

Create `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`:

```typescript
/**
 * Directive parsing for React artifacts.
 *
 * Contract:
 *   Line 1: // @aesthetic: <direction>   (REQUIRED — validator enforces)
 *   Line 2: // @fonts: Family:spec, Family:spec, ...   (OPTIONAL — defaults by direction)
 *
 * Pure functions only. No DOM, no React, no side effects.
 */

export const AESTHETIC_DIRECTIONS = [
  "editorial",
  "brutalist",
  "luxury",
  "playful",
  "industrial",
  "organic",
  "retro-futuristic",
] as const

export type AestheticDirection = (typeof AESTHETIC_DIRECTIONS)[number]

export const DEFAULT_FONTS_BY_DIRECTION: Record<AestheticDirection, string[]> = {
  editorial: [
    "Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900",
    "Inter:wght@400;500;700",
  ],
  brutalist: [
    "Space Grotesk:wght@400;500;700",
    "JetBrains Mono:wght@400;700",
  ],
  luxury: [
    "DM Serif Display:wght@400",
    "DM Sans:wght@300;400;500;700",
  ],
  playful: [
    "Fredoka:wght@400;500;600;700",
  ],
  industrial: [
    "Inter Tight:wght@400;500;700",
    "Space Mono:wght@400;700",
  ],
  organic: [
    "Fraunces:ital,opsz,wght@0,9..144,300..700",
    "Public Sans:wght@400;500",
  ],
  "retro-futuristic": [
    "VT323:wght@400",
    "Space Mono:wght@400;700",
  ],
}

/** Maximum families per artifact. Keeps iframe page-weight bounded. */
export const MAX_FONT_FAMILIES = 3

export interface ParsedDirectives {
  /** Direction parsed from line 1, or null if absent/unknown. */
  aesthetic: AestheticDirection | null
  /** Font specs parsed from line 2, or null if absent/malformed. */
  fonts: string[] | null
  /** Raw aesthetic line if present (for stripping from source). */
  rawAestheticLine: string | null
  /** Raw fonts line if present (for stripping from source). */
  rawFontsLine: string | null
}
```

- [ ] **Step 3: Write a trivial shape test**

Create `tests/unit/react-artifact/directive-parser.test.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/react-artifact/directive-parser.test.ts`

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts tests/unit/react-artifact/directive-parser.test.ts
git commit -m "$(cat <<'EOF'
feat(react-artifact): scaffold directive module with 7 aesthetic directions

- new file _react-directives.ts exports AESTHETIC_DIRECTIONS tuple,
  AestheticDirection type, DEFAULT_FONTS_BY_DIRECTION map
- 7 directions seeded: editorial, brutalist, luxury, playful, industrial,
  organic, retro-futuristic
- constants-only shape test gating future parser + validator tasks

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Implement `parseDirectives(code)`

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`
- Modify: `tests/unit/react-artifact/directive-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/react-artifact/directive-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/react-artifact/directive-parser.test.ts`

Expected: All new tests fail with "parseDirectives is not a function" (or similar).

- [ ] **Step 3: Implement `parseDirectives`**

Append to `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`:

```typescript
const AESTHETIC_LINE_REGEX = /^\s*\/\/\s*@aesthetic\s*:\s*([a-z-]+)\s*$/
const FONTS_LINE_REGEX = /^\s*\/\/\s*@fonts\s*:\s*(.+?)\s*$/

/**
 * Extract `// @aesthetic:` and `// @fonts:` directives from the first two
 * lines of a React artifact. Neither directive is altered in the returned
 * code — the caller is responsible for stripping `rawAestheticLine` /
 * `rawFontsLine` before passing to Babel.
 */
export function parseDirectives(code: string): ParsedDirectives {
  const lines = code.split("\n")
  const line1 = lines[0] ?? ""
  const line2 = lines[1] ?? ""

  const aestheticMatch = line1.match(AESTHETIC_LINE_REGEX)
  const aestheticValue = aestheticMatch?.[1] ?? null
  const aesthetic: AestheticDirection | null =
    aestheticValue && (AESTHETIC_DIRECTIONS as readonly string[]).includes(aestheticValue)
      ? (aestheticValue as AestheticDirection)
      : null
  const rawAestheticLine = aestheticMatch ? line1 : null

  const fontsMatch = line2.match(FONTS_LINE_REGEX)
  const fonts = fontsMatch
    ? fontsMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : null
  const rawFontsLine = fontsMatch ? line2 : null

  return { aesthetic, fonts, rawAestheticLine, rawFontsLine }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/react-artifact/directive-parser.test.ts`

Expected: All tests green (shape tests + aesthetic extraction + fonts extraction suites).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts tests/unit/react-artifact/directive-parser.test.ts
git commit -m "$(cat <<'EOF'
feat(react-artifact): parseDirectives extracts @aesthetic + @fonts

- line 1 must be `// @aesthetic: <direction>` for aesthetic to resolve
- line 2 optionally `// @fonts: Family:spec, Family:spec`
- unknown aesthetic values return null (validator surfaces the error)
- regex tolerates leading whitespace + spaces around colon + commas

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Implement `validateFontSpec` + `buildFontLinks`

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`
- Modify: `tests/unit/react-artifact/directive-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/react-artifact/directive-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/react-artifact/directive-parser.test.ts`

Expected: `validateFontSpec` + `buildFontLinks` tests fail (undefined).

- [ ] **Step 3: Implement `validateFontSpec` and `buildFontLinks`**

Append to `src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts`:

```typescript
/**
 * Validate a Google Fonts CSS2 family spec. The regex matches the four
 * canonical axis forms: wght, ital+wght, opsz+wght, ital+opsz+wght.
 *
 * Rejects specs with characters outside the safe set (anything beyond
 * alphanumeric, spaces, colons, semicolons, commas, dots, and `@`).
 * This prevents URL injection into the fonts.googleapis.com href.
 */
const FONT_SPEC_REGEX =
  /^[A-Z][A-Za-z0-9 ]{1,40}:(wght@[\d;.]+|ital,wght@[\d;,.]+|opsz,wght@[\d;.]+|ital,opsz,wght@[\d;,.]+)$/

export function validateFontSpec(spec: string): boolean {
  return FONT_SPEC_REGEX.test(spec)
}

/**
 * Build `<link>` tags for Google Fonts. Called by the renderer's
 * `buildSrcdoc` to inject webfonts into the sandbox.
 *
 * Rules:
 *  - If `fonts` is null, use the direction's default specs.
 *  - If any entry in `fonts` fails `validateFontSpec`, fall back to the
 *    direction default (precision > partial trust).
 *  - If `fonts` exceeds MAX_FONT_FAMILIES, fall back to the direction default.
 *  - Always emit preconnect hints + the stylesheet link.
 */
export function buildFontLinks(
  aesthetic: AestheticDirection,
  fonts: string[] | null
): string {
  const specs = resolveSpecs(aesthetic, fonts)
  const familyParams = specs
    .map((spec) => `family=${encodeFontSpec(spec)}`)
    .join("&")
  const url = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`
  return [
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="${url}" rel="stylesheet">`,
  ].join("\n")
}

function resolveSpecs(
  aesthetic: AestheticDirection,
  fonts: string[] | null
): string[] {
  if (!fonts) return DEFAULT_FONTS_BY_DIRECTION[aesthetic]
  if (fonts.length === 0 || fonts.length > MAX_FONT_FAMILIES) {
    return DEFAULT_FONTS_BY_DIRECTION[aesthetic]
  }
  if (!fonts.every(validateFontSpec)) {
    return DEFAULT_FONTS_BY_DIRECTION[aesthetic]
  }
  return fonts
}

/**
 * Google Fonts css2 endpoint uses `+` for spaces in family names but
 * keeps `:`, `;`, `,`, `.`, `@`, and digits literal. Standard
 * encodeURIComponent would over-escape these.
 */
function encodeFontSpec(spec: string): string {
  return spec.replace(/ /g, "+")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/react-artifact/directive-parser.test.ts`

Expected: All tests green (constants + parseDirectives + validateFontSpec + buildFontLinks suites).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/_react-directives.ts tests/unit/react-artifact/directive-parser.test.ts
git commit -m "$(cat <<'EOF'
feat(react-artifact): validateFontSpec + buildFontLinks with whitelist

- FONT_SPEC_REGEX constrains family+axis syntax to 4 canonical forms
- buildFontLinks falls back to direction defaults on any malformed spec
- URL construction uses literal `+` for spaces (Google Fonts css2 convention)
- MAX_FONT_FAMILIES=3 cap prevents iframe page-weight blowup

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Validator Updates

### Task 4: `validateReact` hard-errors on missing / invalid `@aesthetic`

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Modify: `tests/unit/validate-artifact.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/validate-artifact.test.ts`:

```typescript
describe("validateArtifactContent — application/react — aesthetic directive", () => {
  const MINIMAL_BODY = `function App() {
  return <div>hi</div>
}
export default App`

  it("accepts a valid @aesthetic directive", () => {
    const code = `// @aesthetic: editorial\n${MINIMAL_BODY}`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts all 7 valid direction names", () => {
    for (const dir of ["editorial", "brutalist", "luxury", "playful", "industrial", "organic", "retro-futuristic"]) {
      const code = `// @aesthetic: ${dir}\n${MINIMAL_BODY}`
      const r = validateArtifactContent("application/react", code)
      expect(r.ok, `direction ${dir} should validate`).toBe(true)
    }
  })

  it("hard-errors when @aesthetic directive is missing", () => {
    const r = validateArtifactContent("application/react", MINIMAL_BODY)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toContain("@aesthetic")
    expect(r.errors.join("\n")).toContain("line 1")
  })

  it("hard-errors when @aesthetic value is unknown", () => {
    const code = `// @aesthetic: synthwave\n${MINIMAL_BODY}`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toMatch(/unknown aesthetic/i)
  })

  it("hard-errors when @aesthetic is not on line 1", () => {
    const code = `// intro\n// @aesthetic: editorial\n${MINIMAL_BODY}`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toContain("@aesthetic")
  })
})

describe("validateArtifactContent — application/react — fonts directive", () => {
  const MINIMAL_BODY = `function App() { return <div/> }\nexport default App`

  it("accepts well-formed @fonts directive", () => {
    const code = `// @aesthetic: editorial
// @fonts: Fraunces:wght@300..900, Inter:wght@400;500;700
${MINIMAL_BODY}`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
  })

  it("hard-errors on malformed @fonts spec", () => {
    const code = `// @aesthetic: editorial
// @fonts: lowercase:wght@400
${MINIMAL_BODY}`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toMatch(/malformed.*@fonts/i)
  })

  it("hard-errors when more than 3 families declared", () => {
    const code = `// @aesthetic: editorial
// @fonts: Inter:wght@400, Lora:wght@400, Roboto:wght@400, Poppins:wght@400
${MINIMAL_BODY}`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toMatch(/too many font families/i)
  })

  it("accepts artifacts with @aesthetic but no @fonts directive", () => {
    const code = `// @aesthetic: editorial\n${MINIMAL_BODY}`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/validate-artifact.test.ts -t "aesthetic directive"`

Expected: All new tests fail (validator does not yet enforce directives).

- [ ] **Step 3: Update `validateReact` to enforce directives**

Open `src/lib/tools/builtin/_validate-artifact.ts`.

Add import at top (around line 21, near the existing `detectShape`/`parseSpec` imports):

```typescript
import {
  AESTHETIC_DIRECTIONS,
  MAX_FONT_FAMILIES,
  parseDirectives,
  validateFontSpec,
} from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"
```

Modify `validateReact` (around line 1640) — insert the directive block at the **start** of the function body, BEFORE the Babel parse:

```typescript
function validateReact(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 0. Directive enforcement — before any JS parsing, so bad directives
  //    surface a clear author-time error instead of a confusing parse fail.
  const directives = parseDirectives(content)

  if (!directives.rawAestheticLine) {
    errors.push(
      'Missing "// @aesthetic: <direction>" directive on line 1. Pick one of: ' +
        AESTHETIC_DIRECTIONS.join(", ") +
        ". See prompt rules for direction selection heuristic."
    )
    return { ok: false, errors, warnings }
  }
  if (!directives.aesthetic) {
    // rawAestheticLine is present but value was unrecognized
    const badValue = directives.rawAestheticLine
      .replace(/^\s*\/\/\s*@aesthetic\s*:\s*/, "")
      .trim()
    errors.push(
      `Unknown aesthetic direction "${badValue}". Valid: ` +
        AESTHETIC_DIRECTIONS.join(", ") +
        "."
    )
    return { ok: false, errors, warnings }
  }
  if (directives.fonts) {
    if (directives.fonts.length > MAX_FONT_FAMILIES) {
      errors.push(
        `Too many font families in @fonts directive (${directives.fonts.length}). Max is ${MAX_FONT_FAMILIES}.`
      )
      return { ok: false, errors, warnings }
    }
    const bad = directives.fonts.filter((s) => !validateFontSpec(s))
    if (bad.length > 0) {
      errors.push(
        `Malformed @fonts directive. Expected comma-separated Google Fonts specs like ` +
          `"Fraunces:wght@300..900, Inter:wght@400;500;700". Bad: ${bad
            .map((s) => `"${s}"`)
            .join(", ")}.`
      )
      return { ok: false, errors, warnings }
    }
  }

  // 1. Must parse as JSX/ES2022
  // ...(existing parse block unchanged)
  ...
}
```

Then strip the directive lines from the content that is passed to `parseJs`. Update the parse block:

```typescript
  // 1. Must parse as JSX/ES2022 — strip directive lines first so Babel
  //    doesn't see top-level comments that vary each artifact.
  const contentForParse = stripDirectiveLines(content, directives)
  let ast
  try {
    ast = parseJs(contentForParse, {
      sourceType: "module",
      allowReturnOutsideFunction: true,
      plugins: ["jsx"],
    })
  } catch (err) {
```

Add the helper at the end of the file (or above `validateReact`):

```typescript
function stripDirectiveLines(
  content: string,
  directives: { rawAestheticLine: string | null; rawFontsLine: string | null }
): string {
  const lines = content.split("\n")
  if (directives.rawFontsLine && lines[1] === directives.rawFontsLine) {
    lines[1] = ""
  }
  if (directives.rawAestheticLine && lines[0] === directives.rawAestheticLine) {
    lines[0] = ""
  }
  return lines.join("\n")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/validate-artifact.test.ts -t "aesthetic directive"`

Expected: All "aesthetic directive" + "fonts directive" cases green.

- [ ] **Step 5: Run the entire validator suite to check for regression**

Run: `bun test tests/unit/validate-artifact.test.ts`

Expected: Every prior test still green. Existing React validation tests (missing export default, class components, bad imports) continue to pass — they'll be using a valid `@aesthetic: industrial` prefix now. **Before this step passes, you may need to prepend `// @aesthetic: industrial\n` to existing React test fixtures in this file.** Find them with:

```bash
grep -nE 'validateArtifactContent\("application/react"' tests/unit/validate-artifact.test.ts
```

For each match, inspect the fixture and prepend the directive. A quick sed pattern that handles the `VALID_REACT` constant at the top of the file:

Look at `tests/unit/validate-artifact.test.ts` lines ~20-30 and update `VALID_REACT`:

```typescript
const VALID_REACT = `// @aesthetic: industrial
function App() {
  const [n, setN] = useState(0);
  return (
    <div className="p-6">
      <button type="button" onClick={() => setN(n + 1)}>{n}</button>
    </div>
  );
}

export default App;`
```

Also update any inline React fixtures that feed `validateArtifactContent("application/react", ...)` — each must declare `// @aesthetic: industrial` on line 1.

Re-run the full suite:

```bash
bun test tests/unit/validate-artifact.test.ts
```

Expected: All tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts tests/unit/validate-artifact.test.ts
git commit -m "$(cat <<'EOF'
feat(validator): validateReact hard-errors on missing/invalid directives

- missing @aesthetic directive on line 1 → error, returns early
- unknown direction value → error with the bad value surfaced
- malformed @fonts spec → error listing the bad entries
- too many families (> 3) → error with the count
- existing React test fixtures prepended with `// @aesthetic: industrial`

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Soft-warn heuristics in `validateReact`

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Modify: `tests/unit/validate-artifact.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/validate-artifact.test.ts`:

```typescript
describe("validateArtifactContent — application/react — palette soft-warn", () => {
  it("warns when editorial + heavy slate/indigo usage", () => {
    const code = `// @aesthetic: editorial
function App() {
  return (
    <div className="bg-slate-50 text-slate-900">
      <div className="text-slate-700 bg-indigo-600 border-slate-200 text-indigo-500 bg-slate-100">hi</div>
    </div>
  )
}
export default App`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/palette.*industrial/i)
  })

  it("does NOT warn when industrial + slate usage", () => {
    const code = `// @aesthetic: industrial
function App() {
  return (
    <div className="bg-slate-50 text-slate-900 border-slate-200 bg-slate-100 text-slate-700 text-indigo-500">hi</div>
  )
}
export default App`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).not.toMatch(/palette/i)
  })

  it("does NOT warn on sparse slate usage (< 6 matches)", () => {
    const code = `// @aesthetic: editorial
function App() {
  return <div className="bg-slate-50 text-slate-900 border-slate-200">hi</div>
}
export default App`
    const r = validateArtifactContent("application/react", code)
    expect(r.warnings.join("\n")).not.toMatch(/palette/i)
  })
})

describe("validateArtifactContent — application/react — font soft-warn", () => {
  it("warns when editorial direction has no serif in @fonts", () => {
    const code = `// @aesthetic: editorial
// @fonts: Inter:wght@400;500;700, Space Mono:wght@400;700
function App() { return <div/> }
export default App`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/serif/i)
  })

  it("does NOT warn when editorial + Fraunces declared", () => {
    const code = `// @aesthetic: editorial
// @fonts: Fraunces:wght@300..900, Inter:wght@400;500;700
function App() { return <div/> }
export default App`
    const r = validateArtifactContent("application/react", code)
    expect(r.warnings.join("\n")).not.toMatch(/serif/i)
  })

  it("does NOT warn when editorial uses default fonts (no @fonts directive)", () => {
    const code = `// @aesthetic: editorial
function App() { return <div/> }
export default App`
    const r = validateArtifactContent("application/react", code)
    // Defaults for editorial include Fraunces → no warn
    expect(r.warnings.join("\n")).not.toMatch(/serif/i)
  })
})

describe("validateArtifactContent — application/react — motion-in-industrial soft-warn", () => {
  it("warns when industrial uses Motion.motion", () => {
    const code = `// @aesthetic: industrial
function App() {
  return <Motion.motion.div animate={{ x: 100 }}>hi</Motion.motion.div>
}
export default App`
    const r = validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/motion/i)
  })

  it("does NOT warn when playful uses Motion.motion", () => {
    const code = `// @aesthetic: playful
function App() {
  return <Motion.motion.div animate={{ x: 100 }}>hi</Motion.motion.div>
}
export default App`
    const r = validateArtifactContent("application/react", code)
    expect(r.warnings.join("\n")).not.toMatch(/motion/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/validate-artifact.test.ts -t "soft-warn"`

Expected: All "soft-warn" tests fail — warnings not yet emitted.

- [ ] **Step 3: Implement the heuristics**

In `src/lib/tools/builtin/_validate-artifact.ts`, extend `validateReact`. Add at the bottom of the function, AFTER the existing error-return block:

```typescript
  // 4. Soft-warn heuristics — aesthetic/style mismatches that should be
  //    surfaced to the author but not block creation. Deliberately simple:
  //    precision over recall, fewer false positives > catching every nit.
  appendAestheticWarnings(content, directives.aesthetic, directives.fonts, warnings)

  return { ok: errors.length === 0, errors, warnings }
}
```

Add the helper above `validateReact` (or at the bottom of the file):

```typescript
/** Serif families that the renderer ships as defaults for at least one direction. */
const KNOWN_SERIF_FAMILIES = [
  "Fraunces",
  "Playfair",
  "DM Serif",
  "Cormorant",
  "Newsreader",
  "Crimson Pro",
  "Lora",
]

/** Threshold above which slate/indigo density is considered "industrial-coded". */
const PALETTE_MISMATCH_THRESHOLD = 6

function appendAestheticWarnings(
  content: string,
  aesthetic: AestheticDirection,
  fonts: string[] | null,
  warnings: string[]
): void {
  // Palette-direction mismatch: non-industrial + dense slate/indigo usage.
  if (aesthetic !== "industrial") {
    const slateIndigoCount = (
      content.match(/\b(slate|indigo)-(\d{2,3})\b/g) ?? []
    ).length
    if (slateIndigoCount >= PALETTE_MISMATCH_THRESHOLD) {
      warnings.push(
        `You declared @aesthetic: ${aesthetic} but the palette reads industrial ` +
          `(${slateIndigoCount} slate/indigo class references). Consider reviewing ` +
          `the color palette for the ${aesthetic} direction.`
      )
    }
  }

  // Font-direction mismatch: editorial or luxury without a serif.
  if (aesthetic === "editorial" || aesthetic === "luxury") {
    const fontsToCheck =
      fonts ?? DEFAULT_FONTS_BY_DIRECTION_FOR_WARN[aesthetic]
    const hasSerif = fontsToCheck.some((spec) =>
      KNOWN_SERIF_FAMILIES.some((family) => spec.startsWith(family))
    )
    if (!hasSerif) {
      warnings.push(
        `@aesthetic: ${aesthetic} typically pairs with a serif display face. ` +
          `No known serif detected in @fonts directive.`
      )
    }
  }

  // Motion-in-industrial: Motion library usage under industrial direction.
  if (aesthetic === "industrial") {
    if (/\bMotion\.(motion|AnimatePresence)\b/.test(content)) {
      warnings.push(
        `Industrial direction favors minimal or no motion. Consider plain CSS ` +
          `transitions instead of framer-motion.`
      )
    }
  }
}
```

Add the cross-reference map near the top of the file (near other constants):

```typescript
/** Mirrors _react-directives DEFAULT_FONTS_BY_DIRECTION — imported at boot time
 *  to avoid reaching into the renderer module from the validator hot path. */
import { DEFAULT_FONTS_BY_DIRECTION as DEFAULT_FONTS_BY_DIRECTION_FOR_WARN } from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"
```

Update the signature of `validateReact` / `appendAestheticWarnings` so `aesthetic` is `AestheticDirection` (it is non-null at this call site — `validateReact` already returned on null). Import the type:

```typescript
import type { AestheticDirection } from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"
```

- [ ] **Step 4: Run soft-warn tests**

Run: `bun test tests/unit/validate-artifact.test.ts -t "soft-warn"`

Expected: All three soft-warn suites green.

- [ ] **Step 5: Re-run full validator suite for regression check**

Run: `bun test tests/unit/validate-artifact.test.ts`

Expected: All tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts tests/unit/validate-artifact.test.ts
git commit -m "$(cat <<'EOF'
feat(validator): validateReact soft-warns on aesthetic mismatches

- palette-direction: non-industrial + ≥6 slate/indigo refs → warn
- font-direction: editorial/luxury without Fraunces/Playfair/DM Serif
  /Cormorant/Newsreader/Crimson Pro/Lora → warn
- motion-in-industrial: Motion.motion or Motion.AnimatePresence under
  industrial direction → warn
- all three are warnings only; hard-errors reserved for directive syntax

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Renderer Integration

### Task 6: Thread directives through `preprocessCode`

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx`

- [ ] **Step 1: Update the imports at the top of `react-renderer.tsx`**

Open `src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx`.

Current (around line 3-5):
```typescript
import { useMemo, useEffect, useState, useCallback, useRef } from "react"
import { AlertTriangle, RotateCcw, Code, Loader2, Wand2 } from "@/lib/icons"
import { IFRAME_NAV_BLOCKER_SCRIPT } from "./_iframe-nav-blocker"
```

Add a new import line immediately after the nav blocker import:
```typescript
import {
  parseDirectives,
  buildFontLinks,
  type AestheticDirection,
  type ParsedDirectives,
} from "./_react-directives"
```

- [ ] **Step 2: Update `preprocessCode` return type**

Extend the return type to include directives:

```typescript
function preprocessCode(code: string): {
  processedCode: string
  componentName: string
  unsupportedImports: string[]
  directives: ParsedDirectives
} {
```

- [ ] **Step 3: Extract + strip directives before any other transformation**

Inside `preprocessCode`, immediately after the `let processed = code` line (around line 70), add:

```typescript
  // Extract directives from line 1 + line 2, strip them from the code that
  // gets passed to Babel (the <link> tags are handled in buildSrcdoc).
  const directives = parseDirectives(processed)
  if (directives.rawAestheticLine || directives.rawFontsLine) {
    const lines = processed.split("\n")
    if (directives.rawAestheticLine && lines[0] === directives.rawAestheticLine) {
      lines[0] = ""
    }
    if (directives.rawFontsLine && lines[1] === directives.rawFontsLine) {
      lines[1] = ""
    }
    processed = lines.join("\n")
  }
```

- [ ] **Step 4: Return directives from `preprocessCode`**

At the bottom of `preprocessCode`, change:

```typescript
  return { processedCode: finalCode.trim(), componentName, unsupportedImports }
```

to:

```typescript
  return { processedCode: finalCode.trim(), componentName, unsupportedImports, directives }
```

- [ ] **Step 5: Update the `useMemo` consumer to capture directives**

In the `ReactRenderer` component (around line 361), update the destructuring:

```typescript
  const { srcdoc, unsupported } = useMemo(() => {
    setError(null)
    try {
      const { processedCode, componentName, unsupportedImports, directives } = preprocessCode(content)
      if (unsupportedImports.length > 0) {
        setError(
          `Unsupported ${unsupportedImports.length === 1 ? "library" : "libraries"}: ${unsupportedImports.join(", ")}. ` +
          `Available: react, recharts, lucide-react, framer-motion.`
        )
      }
      return {
        srcdoc: buildSrcdoc(processedCode, componentName, directives),
        unsupported: unsupportedImports,
      }
    } catch (err) {
```

- [ ] **Step 6: Verify renderer module still type-checks**

Run:
```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "react-renderer|_react-directives" | head -20
```

Expected: no errors on these two files (other pre-existing errors elsewhere in the repo, if any, are out of scope).

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx
git commit -m "$(cat <<'EOF'
feat(react-renderer): thread directives through preprocessCode

- preprocessCode now returns ParsedDirectives alongside processedCode
- directive lines are stripped from the string that feeds Babel
- buildSrcdoc signature extended; next commit consumes directives to
  drive dynamic font <link> injection

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Dynamic font injection in `buildSrcdoc`

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx`

- [ ] **Step 1: Update `buildSrcdoc` signature**

In `react-renderer.tsx`, find `buildSrcdoc` (around line 221). Change signature:

```typescript
function buildSrcdoc(
  code: string,
  componentName: string,
  directives: ParsedDirectives
): string {
```

- [ ] **Step 2: Compute the font links inline at the top of the function**

Immediately after the escape step:

```typescript
  const escapedCode = code.replace(/<\/script>/gi, "<\\/script>")

  // Pick fonts based on declared @aesthetic + @fonts directives. Falls back
  // to "industrial" defaults if the aesthetic is somehow null at this point
  // (validator should have caught it upstream, but defend anyway).
  const aesthetic: AestheticDirection = directives.aesthetic ?? "industrial"
  const fontLinks = buildFontLinks(aesthetic, directives.fonts)
```

- [ ] **Step 3: Replace the hard-coded Inter `<link>` block**

Find these three lines in the returned template literal (around line 231-233):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

Replace with a single interpolation:

```html
${fontLinks}
```

- [ ] **Step 4: Update the iframe body styles — remove the Inter hard-reference**

Find the `<style>` block inside the iframe template (around line 243):

```html
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  #root { min-height: 100vh; }
</style>
```

Replace with a direction-aware default that still falls back gracefully if webfont load fails:

```html
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  #root { min-height: 100vh; }
</style>
```

The artifact code itself is now responsible for picking the display/body font via Tailwind `font-[...]` classes. System font is the safety net.

- [ ] **Step 5: Smoke-test the renderer against the existing example**

Run the dev server (or a Vitest render test if available). At minimum, run:

```bash
bun test tests/unit/validate-artifact.test.ts tests/unit/react-artifact/directive-parser.test.ts
```

Expected: Green. The renderer wiring does not break the parser or validator.

- [ ] **Step 6: Manual spot-check (if dev server is running)**

Start dev server if not already:
```bash
bun run dev
```

Open the app, paste a canned artifact into a chat (or use an existing React artifact document), verify:
- The page shows without the old Inter hard-load flash
- Font family applied in the iframe matches the declared `@aesthetic` direction
- DevTools Network tab shows Google Fonts request to the expected families

Skip this step if dev server is unavailable; the test suite is authoritative.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx
git commit -m "$(cat <<'EOF'
feat(react-renderer): inject Google Fonts from directives, drop Inter lock

- buildSrcdoc consumes parsed directives to pick font families per artifact
- <link> tags produced by buildFontLinks respect direction defaults + @fonts
- iframe body font-family falls back to system stack; artifact code owns
  the display/body choice via Tailwind font-[...] utilities

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Prompt Rewrite

### Task 8: Rewrite `react.ts` rules structure

**Files:**
- Modify: `src/lib/prompts/artifacts/react.ts`

- [ ] **Step 1: Read the current file end-to-end**

Re-read `src/lib/prompts/artifacts/react.ts`. The new rules section will replace lines 6–82 (current `rules` template literal body). Examples (lines 83–167) are replaced in Task 9.

- [ ] **Step 2: Replace the `rules` template literal**

Open `src/lib/prompts/artifacts/react.ts`. Replace the `rules: \`...\`` value (the entire template literal between the backticks on line 6 and the closing backtick before `examples` on line 83) with this new body:

```typescript
rules: `**application/react — Self-contained React Components**

You are generating a single React component that will be transpiled by Babel-standalone and rendered into a sandboxed iframe at \`#root\`. Output must be production-grade AND visually distinctive. The failure mode to avoid is a generic "SaaS dashboard" that looks like every other AI-generated component.

## Runtime Environment
**Libraries are exposed as window globals — do NOT \`import\` from them. Just use them directly.**

| Global | What | Version |
|---|---|---|
| \`React\` + all hooks (\`useState\`, \`useEffect\`, \`useRef\`, \`useMemo\`, \`useCallback\`, \`useReducer\`, \`useContext\`, \`useId\`, \`useTransition\`, \`useDeferredValue\`, \`useLayoutEffect\`, \`useSyncExternalStore\`, \`useInsertionEffect\`, \`createContext\`, \`forwardRef\`, \`memo\`, \`Fragment\`, \`Suspense\`, \`lazy\`, \`startTransition\`, \`createElement\`, \`isValidElement\`, \`Children\`, \`cloneElement\`) — pre-destructured into scope | React | 18 |
| \`Recharts\` — \`<LineChart>\`, \`<BarChart>\`, \`<PieChart>\`, \`<AreaChart>\`, \`<ResponsiveContainer>\`, \`<Tooltip>\`, etc. | charts | 2 |
| \`LucideReact\` — \`LucideReact.ArrowRight\`, \`LucideReact.Check\`, ... | icons | 0.454 |
| \`Motion\` — \`Motion.motion.div\`, \`Motion.AnimatePresence\` | framer-motion | 11 |
| **Tailwind CSS v3** — utility classes available globally | styling | CDN |

You CAN write \`import\` lines — the preprocessor strips them — but only from: \`react\`, \`recharts\`, \`lucide-react\`, \`framer-motion\`. Anything else is silently dropped. Cleanest output: skip imports, use globals.

**Sandbox**: \`allow-scripts\` only — no modals, no real form submission, no popups, no real navigation. All forms must use \`onSubmit={(e) => { e.preventDefault(); ... }}\`. No \`window.open\`, no \`location.href = ...\`. **No real network** — mock all data.

## Required Component Shape
\`\`\`jsx
// @aesthetic: editorial
// @fonts: Fraunces:wght@300..900, Inter:wght@400;500;700
function App() {
  return <div className="min-h-screen bg-bone text-ink font-['Inter'] antialiased">...</div>;
}
export default App;
\`\`\`
- **Line 1 MUST be** \`// @aesthetic: <direction>\` (required).
- **Line 2 MAY be** \`// @fonts: Family:spec, Family:spec\` (optional, defaults applied per direction).
- **MUST** have \`export default\` (function or const).
- **MUST** be a function component. **NEVER** \`class extends React.Component\`.
- **NEVER** \`document.querySelector\` / \`document.getElementById\`. Use \`useRef\`.
- **NEVER** import a CSS file. Tailwind is already loaded.

## Aesthetic Direction — Pick ONE and Commit

For every React artifact, pick a distinctive aesthetic direction BEFORE writing code. Do NOT default to "slate-900 + indigo-600 + Inter" — that is the AI-slop failure mode.

| Direction | When to pick (signals in user prompt) |
|---|---|
| \`editorial\` | article, blog, story, brand page, about, long-form, "magazine", "essay layout" |
| \`brutalist\` | indie tool, manifesto, dev product, raw, punky, no-BS, hacker, anti-corporate |
| \`luxury\` | premium, hospitality, fashion, watches, "high-end", "refined", "timeless" |
| \`playful\` | kids, onboarding, creative tool, fun, friendly, consumer app, gamification |
| \`industrial\` | dashboard, admin, monitoring, analytics, status, ops, "data-heavy" |
| \`organic\` | wellness, sustainability, food, skincare, crafts, artisan, natural |
| \`retro-futuristic\` | gaming, sci-fi, events, synthwave, cyberpunk, 80s, music/DJ |

**Ambiguous cases:** default to \`editorial\` (opinionated "thoughtful general-purpose", explicitly NOT the old slate+indigo).

**User override:** if the user says "make it brutalist" or "use luxury styling", honor that verbatim regardless of content signal.

## Directive Syntax

**Line 1 (required):** \`// @aesthetic: <direction>\` where \`<direction>\` is exactly one of:
\`editorial | brutalist | luxury | playful | industrial | organic | retro-futuristic\`

**Line 2 (optional):** \`// @fonts: Family:spec, Family:spec\` — comma-separated Google Fonts family specs. Max 3 families. Omit to use the direction's default pairing.

Valid family spec shapes:
- \`Inter:wght@400;500;700\`
- \`Fraunces:ital,wght@0,400;1,700\`
- \`Fraunces:opsz,wght@9..144,300..900\`
- \`Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900\`

## Design System per Direction

### editorial — content-first, reading-oriented
**Fonts:** \`Fraunces\` (display, variable ital+opsz+wght) + \`Inter\` (body). Optionally \`Newsreader\` for body as an alternative.
**Palette:** bone (\`#faf5ef\`, \`#f5f0e6\`) + ink (\`#0a0a0a\`, \`#1c1917\`) + warm neutrals (\`#78716c\`) + ONE bold accent from: terracotta \`#c2410c\`, bottle green \`#065f46\`, deep burgundy \`#7f1d1d\`, ultramarine \`#1e3a8a\`.
**Rhythm:** Generous whitespace. \`py-24 md:py-32\` sections. Asymmetric 12-col grids (7+5, 8+4). Pull quotes. Drop caps via \`first-letter:text-7xl first-letter:font-['Fraunces']\`.
**Buttons:** \`px-6 py-3 border border-ink text-ink hover:bg-ink hover:text-bone transition\` — flat, bordered, no shadow.
**Cards:** content blocks with top/bottom rules, no boxes.
**Motion:** \`duration-500\` \`ease-[cubic-bezier(0.22,1,0.36,1)]\`. Stagger delays 80–120ms on scroll reveals.

### brutalist — raw, punky, anti-corporate
**Fonts:** \`Space Grotesk\` 700 or \`Archivo Black\` (display) + \`JetBrains Mono\` or \`IBM Plex Mono\` (body/UI).
**Palette:** pure white (\`#ffffff\`) + pure black (\`#000000\`) + ONE acid accent: acid yellow \`#facc15\`, alert red \`#dc2626\`, electric blue \`#2563eb\`, lime \`#84cc16\`. No gradients. No grays except \`#e5e5e5\` for rules.
**Rhythm:** Dense. Visible grid (dashed borders). Sharp corners — \`rounded-none\`. Offset layouts (negative margins, intentional broken alignment).
**Buttons:** \`px-4 py-2 bg-black text-white border-2 border-black hover:bg-[acid] hover:text-black transition-none\` — instant, no easing.
**Cards:** \`border-2 border-black rounded-none\`, no shadow.
**Inputs:** \`border-b-2 border-black bg-transparent rounded-none\` or fully bordered sharp corners.
**Motion:** \`duration-75\` to \`duration-150\`, \`ease-linear\` or no ease. Snap transitions, no fades.

### luxury — premium, refined, timeless
**Fonts:** \`DM Serif Display\` or \`Cormorant Garamond\` 300/500/700 (display) + \`DM Sans\` 300/400/500 or \`Work Sans\` (body).
**Palette:** near-black \`#0c0a09\` \`#1c1917\` + cream \`#faf5ef\` \`#fefdfb\` + gold \`#d4af37\` \`#b8860b\` + warm gray \`#78716c\`. No indigo. No purple. No bright anything.
**Rhythm:** Very generous. Tight leading on display (\`leading-[0.95]\`). \`tracking-wide\` / \`tracking-widest\` on small-caps labels.
**Buttons:** \`px-8 py-4 bg-[#0c0a09] text-[#d4af37] border border-[#d4af37] hover:bg-[#d4af37] hover:text-[#0c0a09] transition-all duration-500\`.
**Cards:** thin gold hairline borders (\`border border-[#d4af37]/30\`), no shadow.
**Motion:** \`duration-500\` to \`duration-700\`, \`ease-[cubic-bezier(0.33,1,0.68,1)]\`. Staggered parallax on hero.

### playful — rounded, pastel, toy-like
**Fonts:** \`Fredoka\` 400/500/600/700 or \`Quicksand\` 400/500/700 (display + body — same family different weights is OK).
**Palette:** pastel backgrounds from \`#fce7f3\` pink, \`#e0e7ff\` indigo, \`#dcfce7\` green, \`#fef3c7\` yellow, \`#fae8ff\` purple + ONE vivid anchor: \`#f97316\` orange, \`#a855f7\` purple, \`#06b6d4\` cyan, \`#ec4899\` pink.
**Rhythm:** Rounded everything — \`rounded-2xl\`, \`rounded-3xl\`, \`rounded-full\`. Generous padding. Oversized type (\`text-5xl md:text-6xl\` hero).
**Buttons:** \`px-6 py-3 bg-[vivid] text-white rounded-full shadow-[0_4px_0_rgba(0,0,0,0.1)] hover:shadow-[0_2px_0_rgba(0,0,0,0.1)] hover:translate-y-0.5 transition\`.
**Cards:** \`rounded-3xl bg-[pastel] shadow-none border-none\`.
**Motion:** Bouncy springs via Motion library — \`Motion.motion.div\` with \`transition={{ type: "spring", stiffness: 200, damping: 15 }}\`. Overshoot, wobble, stagger.

### industrial — dense, functional, data-heavy
**Fonts:** \`Inter Tight\` 400/500/700 or \`Archivo\` (display/body) + \`Space Mono\` 400/700 or \`JetBrains Mono\` (tabular data / IDs / timestamps).
**Palette:** slate-950 \`#020617\` or slate-900 \`#0f172a\` dark text + slate-50/100 light surfaces + ONE functional accent (\`#3b82f6\` blue primary) + status colors (\`#10b981\` emerald up, \`#f43f5e\` rose down, \`#f59e0b\` amber warn). Multi-color OK because functional.
**Rhythm:** Dense. Grid-heavy. Tabular alignment. \`gap-px\` grids with dividers. Sparklines inline. \`tabular-nums\` for numbers. Right-align numeric columns.
**Buttons:** \`h-9 px-3 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500\`.
**Cards:** \`rounded-lg border border-slate-200 bg-white shadow-sm\`.
**Motion:** Minimal or none. Updates feel instant. Skeletons over spinners. \`duration-150 ease-out\` max. **Using Motion library here triggers a validator warning.**

### organic — earthy, humanist, warm
**Fonts:** \`Fraunces\` (variable) or \`Public Sans\` 400/500/700 (display) + \`Public Sans\` 400/500 or \`Crimson Pro\` 400/500/600 (body). Mix humanist sans + soft serif.
**Palette:** bone \`#faf5ef\` + moss \`#3f6212\` \`#65a30d\` + terracotta \`#c2410c\` \`#ea580c\` + sand/taupe \`#a8a29e\` \`#d6d3d1\`. Warm, earthy. No cool blues. No pure gray.
**Rhythm:** Medium-generous. Soft curves — \`rounded-xl\` or \`rounded-2xl\` but never \`rounded-3xl\`. Asymmetric but gentle. Italic Fraunces as handwritten-style accents.
**Buttons:** \`px-6 py-3 rounded-full bg-[moss] text-bone hover:bg-[moss-dark] transition-all duration-300\`.
**Cards:** \`rounded-2xl bg-bone border border-taupe/20 shadow-[0_1px_2px_rgba(120,113,108,0.05)]\` — very soft shadow.
**Motion:** Soft. \`duration-300\` to \`duration-500\`, \`ease-in-out\`.

### retro-futuristic — neon, tabular, glitch
**Fonts:** \`VT323\` or \`Major Mono Display\` or \`Orbitron\` 400/700/900 (display) + \`Space Mono\` 400/700 or \`Share Tech Mono\` (body).
**Palette:** black \`#030712\` or deep purple \`#1e0a2e\` bg + neon accents: cyan \`#22d3ee\`, magenta \`#e879f9\`, lime \`#84cc16\`, hot pink \`#f472b6\`, electric yellow \`#fde047\`. Optional gradient between two neons.
**Rhythm:** Monospace tabular. Visible grid lines. Scanline textures via \`background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)\`. Chromatic aberration on hover (dual-color text-shadow offsets).
**Buttons:** \`px-6 py-2 bg-transparent border border-[neon] text-[neon] hover:shadow-[0_0_20px_currentColor] transition\`.
**Cards:** \`border border-[neon] bg-black/50 backdrop-blur-sm\`.
**Text effects:** neon glow via \`drop-shadow-[0_0_10px_currentColor]\` or arbitrary \`text-shadow\` utility.
**Motion:** Glitch effects, scanline scrolls, chromatic splits on hover. \`duration-75\` snap + subtle flicker loops via \`@keyframes\`.

## State Patterns
- **Forms:** controlled components, validate on submit, inline \`aria-invalid\` errors.
- **Mock fetching:** \`useEffect\` + \`setTimeout\`, show skeleton while loading.
- **Tabs:** \`const [view, setView] = useState('overview')\` with \`role="tablist"\` and \`aria-selected\`.

## Accessibility
- Every \`<button>\` has \`type="button"\` (or \`type="submit"\` inside a form).
- Icon-only buttons: \`<span className="sr-only">Description</span>\`.
- Form labels paired via \`htmlFor\`/\`id\`. Visible focus ring on every interactive element.
- \`aria-live\` for dynamic status. Color contrast ≥ 4.5:1 at all times (yes, even in retro-futuristic — neon on black is fine; neon on neon is not).

## Code Quality — STRICT
- **NEVER truncate.** No \`/* ...rest of component... */\`. Output the COMPLETE component.
- **NEVER use placeholders** like \`Lorem ipsum\` — write realistic direction-appropriate copy.
- Mock data should be realistic and named (\`const RECENT_ORDERS = [{ id: 'ORD-1041', customer: 'Sara Chen', total: 248.00 }, ...]\`).
- No dead code, no commented-out alternatives.
- \`useCallback\`/\`useMemo\` only when there is an actual perf reason.
- List keys must be stable IDs, never array indexes (unless the list is truly static).

## Anti-Patterns
- ❌ Missing \`// @aesthetic:\` directive on line 1 (hard-error at validation)
- ❌ Unknown aesthetic direction name (hard-error)
- ❌ Malformed \`@fonts\` spec (hard-error)
- ❌ More than 3 font families (hard-error)
- ❌ Mixing directions in one artifact — commit to ONE
- ❌ Silently defaulting to slate-900 + indigo-600 without \`@aesthetic: industrial\` (palette-mismatch warn)
- ❌ Motion library under \`@aesthetic: industrial\` (warn — industrial wants stillness)
- ❌ Editorial/luxury without a serif in \`@fonts\` (font-mismatch warn)
- ❌ \`import { Card } from 'shadcn/ui'\` — shadcn is NOT available, build with raw Tailwind
- ❌ \`import './styles.css'\` — silently dropped
- ❌ \`class MyComponent extends React.Component\`
- ❌ \`document.getElementById('foo')\`
- ❌ Emoji as functional icons (use \`LucideReact.X\`)
- ❌ Real \`fetch()\` calls
- ❌ \`<form action="/submit">\` — use \`onSubmit\` with \`e.preventDefault()\`
- ❌ More than 5 colors per direction
- ❌ Truncating "for brevity"`,
```

- [ ] **Step 3: Verify the rules compile as a TypeScript string literal**

Run:
```bash
bunx tsc --noEmit src/lib/prompts/artifacts/react.ts 2>&1 | head -20
```

Expected: no errors. If there are errors, most likely cause is an unescaped backtick or `${...}` inside the new rules — audit for those.

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts/artifacts/react.ts
git commit -m "$(cat <<'EOF'
feat(prompts): rewrite react artifact rules around aesthetic menu

- replace hard-coded slate+indigo+Inter design system
- add 7 direction menu with selection heuristic table
- document directive syntax + per-direction design systems
- anti-patterns now flag palette-direction drift and motion-in-industrial

examples still reference the single revenue dashboard; next commit
replaces with 4 direction-diverse examples

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Replace single example with 4 direction-diverse examples

**Files:**
- Modify: `src/lib/prompts/artifacts/react.ts`

- [ ] **Step 1: Locate the `examples` array**

In `src/lib/prompts/artifacts/react.ts`, find the `examples` array (around line 83 after the rules replacement). Replace the single entry with four.

- [ ] **Step 2: Write the four examples**

Replace the `examples: [...]` block with:

```typescript
  examples: [
    {
      label: "editorial — small-roaster brand page",
      code: `// @aesthetic: editorial
// @fonts: Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900, Inter:wght@400;500;700

const SEASONAL = [
  { id: 'ETH-YIRG-2026', name: 'Yirgacheffe Kochere', origin: 'Ethiopia', notes: 'bergamot, jasmine, black tea', price: 22 },
  { id: 'COL-NARI-2026', name: 'Nariño Supremo', origin: 'Colombia', notes: 'red apple, cocoa, molasses', price: 19 },
  { id: 'KEN-NYER-2026', name: 'Nyeri AA', origin: 'Kenya', notes: 'blackcurrant, grapefruit, honey', price: 24 },
];

function App() {
  return (
    <div className="min-h-screen bg-[#faf5ef] text-[#0a0a0a] font-['Inter'] antialiased">
      <header className="mx-auto max-w-6xl px-6 py-8 flex items-baseline justify-between border-b border-[#e5e0d5]">
        <div className="font-['Fraunces'] text-2xl tracking-tight">Halcyon Roasters</div>
        <nav className="flex gap-8 text-sm uppercase tracking-widest text-[#78716c]">
          <a href="#">Shop</a><a href="#">Wholesale</a><a href="#">Journal</a>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-24 pb-20 grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-7">
          <p className="text-sm uppercase tracking-[0.25em] text-[#c2410c] mb-6">Spring 2026 · Lot release</p>
          <h1 className="font-['Fraunces'] text-6xl md:text-7xl leading-[0.95] tracking-tight">
            Coffee the way <em className="italic">a letter</em> is written.
          </h1>
        </div>
        <div className="col-span-12 md:col-span-5 md:pt-16">
          <p className="text-lg leading-relaxed text-[#44403c] first-letter:text-6xl first-letter:font-['Fraunces'] first-letter:float-left first-letter:mr-2 first-letter:leading-none">
            Every spring we travel to three origins, cup a thousand lots, and bring home the three that most
            surprised us. Not the highest-scoring. The ones that refused to settle.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="font-['Fraunces'] text-3xl tracking-tight border-b border-[#0a0a0a] pb-4 mb-8">This season</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {SEASONAL.map((c) => (
            <article key={c.id} className="border-t border-[#0a0a0a] pt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-[#78716c]">{c.origin}</p>
              <h3 className="font-['Fraunces'] text-2xl mt-2 mb-3">{c.name}</h3>
              <p className="text-sm text-[#44403c] leading-relaxed">{c.notes}</p>
              <div className="mt-6 flex items-baseline justify-between">
                <span className="font-['Fraunces'] text-xl">\${c.price}</span>
                <button type="button" className="px-5 py-2 border border-[#0a0a0a] text-sm tracking-wider hover:bg-[#0a0a0a] hover:text-[#faf5ef] transition">Order 340g</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;`,
    },
    {
      label: "brutalist — CLI tool homepage",
      code: `// @aesthetic: brutalist
// @fonts: Space Grotesk:wght@400;500;700, JetBrains Mono:wght@400;700

function App() {
  const [copied, setCopied] = useState(false);
  const install = 'curl -fsSL get.bolt.sh | sh';
  const copy = () => {
    navigator.clipboard?.writeText(install);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="min-h-screen bg-white text-black font-['Space_Grotesk'] antialiased">
      <header className="border-b-2 border-black px-6 py-4 flex items-center justify-between">
        <div className="text-2xl font-bold tracking-tight">bolt.</div>
        <div className="flex gap-6 font-['JetBrains_Mono'] text-sm">
          <a href="#">docs/</a><a href="#">github/</a><a href="#">changelog.md</a>
        </div>
      </header>

      <section className="px-6 py-24 border-b-2 border-black">
        <p className="font-['JetBrains_Mono'] text-sm mb-6 text-black">// v0.12.0 · shipped today</p>
        <h1 className="text-6xl md:text-8xl font-bold leading-[0.9] tracking-tight max-w-5xl">
          Refactor a million lines.<br />
          <span className="bg-[#facc15] px-2 inline-block mt-2">In one afternoon.</span>
        </h1>
        <p className="mt-8 text-lg max-w-2xl font-['JetBrains_Mono']">
          bolt is a structural-search-and-replace tool for monorepos. It reads your AST, not your regex.
        </p>

        <div className="mt-12 flex items-center gap-4 max-w-2xl border-2 border-black">
          <div className="flex-1 px-4 py-3 font-['JetBrains_Mono'] text-sm">{install}</div>
          <button type="button" onClick={copy} className="px-5 py-3 bg-black text-white hover:bg-[#facc15] hover:text-black border-l-2 border-black transition-none font-['JetBrains_Mono'] text-sm">
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 border-b-2 border-black">
        {[
          { n: '01', t: 'AST-native search', b: 'structural patterns. not greps.' },
          { n: '02', t: 'monorepo aware', b: 'one pass. every package.' },
          { n: '03', t: 'diffable output', b: 'review. apply. revert.' },
        ].map((f) => (
          <div key={f.n} className="px-6 py-12 border-r-2 last:border-r-0 border-black">
            <div className="font-['JetBrains_Mono'] text-sm mb-6 text-black">{f.n}.</div>
            <h3 className="text-2xl font-bold mb-3 tracking-tight">{f.t}</h3>
            <p className="font-['JetBrains_Mono'] text-sm">{f.b}</p>
          </div>
        ))}
      </section>

      <footer className="px-6 py-6 font-['JetBrains_Mono'] text-xs flex justify-between">
        <span>MIT · © 2026</span>
        <span>built in sf. no ai generated code.</span>
      </footer>
    </div>
  );
}

export default App;`,
    },
    {
      label: "industrial — revenue dashboard with Recharts",
      code: `// @aesthetic: industrial
// @fonts: Inter Tight:wght@400;500;700, Space Mono:wght@400;700

const REVENUE = [
  { month: 'Jan', revenue: 12400, orders: 142 },
  { month: 'Feb', revenue: 15800, orders: 168 },
  { month: 'Mar', revenue: 14200, orders: 159 },
  { month: 'Apr', revenue: 18900, orders: 201 },
  { month: 'May', revenue: 21500, orders: 234 },
  { month: 'Jun', revenue: 24800, orders: 267 },
];

const STATS = [
  { label: 'Revenue', value: '$108k', delta: '+18.2%', positive: true },
  { label: 'Orders', value: '1,171', delta: '+12.4%', positive: true },
  { label: 'AOV', value: '$92.30', delta: '-2.1%', positive: false },
  { label: 'Refund rate', value: '1.4%', delta: '-0.3%', positive: true },
];

function App() {
  const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } = Recharts;
  const { TrendingUp, TrendingDown } = LucideReact;
  const [range, setRange] = useState('6m');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-['Inter_Tight'] antialiased">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Revenue overview</h1>
            <p className="mt-1 text-sm text-slate-500 font-['Space_Mono']">Last 6 months · updated just now</p>
          </div>
          <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {['1m','3m','6m','1y'].map((r) => (
              <button key={r} type="button" role="tab" aria-selected={range === r}
                onClick={() => setRange(r)}
                className={\`h-8 px-3 rounded-md text-sm font-medium transition \${range === r ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}\`}>
                {r}
              </button>
            ))}
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-lg bg-white border border-slate-200 p-5 shadow-sm">
              <div className="text-sm text-slate-500">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{s.value}</div>
              <div className={\`mt-2 inline-flex items-center gap-1 text-xs font-medium \${s.positive ? 'text-emerald-600' : 'text-rose-600'}\`}>
                {s.positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{s.delta}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-lg bg-white border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Monthly revenue</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={REVENUE} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => \`$\${v/1000}k\`} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                  formatter={(v) => [\`$\${v.toLocaleString()}\`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;`,
    },
    {
      label: "playful — kids' app onboarding",
      code: `// @aesthetic: playful
// @fonts: Fredoka:wght@400;500;600;700

function App() {
  const [step, setStep] = useState(0);
  const STEPS = [
    { emoji: '🎨', title: 'Pick a color', body: 'Every creature starts with YOUR favorite color. Bold. Soft. Sparkly. Up to you.' },
    { emoji: '✏️', title: 'Draw together', body: 'Tap-tap-tap and watch the lines wiggle. It learns what you like.' },
    { emoji: '🎉', title: 'Name them', body: 'Marshmallow? Captain Broccoli? Whatever sticks — they remember.' },
  ];
  const s = STEPS[step];

  return (
    <div className="min-h-screen bg-[#fce7f3] text-[#831843] font-['Fredoka'] antialiased flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between">
        <div className="text-3xl font-bold">doodlepals</div>
        <button type="button" className="text-sm font-medium underline decoration-wavy underline-offset-4">skip →</button>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 items-center gap-8 px-8 py-12 max-w-6xl mx-auto w-full">
        <div className="order-2 md:order-1">
          <p className="text-sm uppercase tracking-wider font-semibold mb-4 text-[#f472b6]">Step {step + 1} of 3</p>
          <h1 className="text-6xl font-bold leading-[0.95] mb-6">{s.title}</h1>
          <p className="text-xl leading-relaxed text-[#831843]/80 max-w-md">{s.body}</p>

          <div className="mt-10 flex gap-3">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)}
                className="px-6 py-3 rounded-full bg-white text-[#831843] font-semibold shadow-[0_4px_0_rgba(131,24,67,0.15)] hover:shadow-[0_2px_0_rgba(131,24,67,0.15)] hover:translate-y-0.5 transition">
                back
              </button>
            )}
            <button type="button" onClick={() => setStep(Math.min(step + 1, STEPS.length - 1))}
              className="px-8 py-3 rounded-full bg-[#f97316] text-white font-semibold shadow-[0_4px_0_rgba(249,115,22,0.35)] hover:shadow-[0_2px_0_rgba(249,115,22,0.35)] hover:translate-y-0.5 transition">
              {step === STEPS.length - 1 ? "let's doodle!" : 'next'}
            </button>
          </div>

          <div className="mt-8 flex gap-2">
            {STEPS.map((_, i) => (
              <span key={i} className={\`h-2 rounded-full transition-all \${i === step ? 'w-10 bg-[#f97316]' : 'w-2 bg-[#f472b6]/50'}\`} />
            ))}
          </div>
        </div>

        <Motion.motion.div
          key={step}
          initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="order-1 md:order-2 rounded-3xl bg-white aspect-square max-w-sm mx-auto w-full flex items-center justify-center shadow-[0_16px_0_rgba(236,72,153,0.15)]">
          <span className="text-[10rem]" aria-hidden>{s.emoji}</span>
        </Motion.motion.div>
      </main>
    </div>
  );
}

export default App;`,
    },
  ],
}
```

- [ ] **Step 3: Verify the file compiles**

Run:
```bash
bunx tsc --noEmit src/lib/prompts/artifacts/react.ts 2>&1 | head -20
```

Expected: no errors on this file. If there are unescaped backticks or `${}` inside JSX class names, audit carefully — Tailwind arbitrary values like `bg-[#facc15]` are fine but template literals inside the example code must use escaped backticks (`\`) for the outer string delimiter and `\${}` for interpolation inside the example code (which becomes `${}` in the source).

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts/artifacts/react.ts
git commit -m "$(cat <<'EOF'
feat(prompts): four react examples covering four aesthetic directions

- editorial (coffee roaster brand page): Fraunces + bone/ink/terracotta
- brutalist (CLI tool home): Space Grotesk + black/white/acid-yellow
- industrial (revenue dashboard): Inter Tight + slate + blue — proves the
  prior default still works, now explicitly declared not accidentally
  defaulted to
- playful (kids app onboarding): Fredoka + pastel pink + vivid orange
  with framer-motion spring on illustration swap

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Fixtures & Regression

### Task 10: Three fixtures — editorial, brutalist, luxury

**Files:**
- Create: `tests/fixtures/react-artifacts/aesthetic-editorial.tsx`
- Create: `tests/fixtures/react-artifacts/aesthetic-brutalist.tsx`
- Create: `tests/fixtures/react-artifacts/aesthetic-luxury.tsx`

- [ ] **Step 1: Create the fixture directory**

Run:
```bash
mkdir -p tests/fixtures/react-artifacts
```

- [ ] **Step 2: Write `aesthetic-editorial.tsx`**

Create `tests/fixtures/react-artifacts/aesthetic-editorial.tsx`:

```tsx
// @aesthetic: editorial
// @fonts: Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900, Inter:wght@400;500;700

const ISSUES = [
  { no: 'No. 14', date: 'April 2026', title: 'The Quiet Renaissance of Small Print' },
  { no: 'No. 13', date: 'March 2026', title: 'On Waiting: A Defense of Slow Books' },
  { no: 'No. 12', date: 'February 2026', title: 'When Typography Stops Being Invisible' },
];

function App() {
  return (
    <div className="min-h-screen bg-[#faf5ef] text-[#0a0a0a] font-['Inter'] antialiased">
      <header className="mx-auto max-w-5xl px-6 py-12 text-center border-b border-[#0a0a0a]">
        <p className="text-xs uppercase tracking-[0.35em] text-[#065f46]">Est. 2019 · Quarterly</p>
        <h1 className="font-['Fraunces'] text-6xl md:text-7xl tracking-tight mt-3 italic">Margin Notes</h1>
        <p className="mt-4 text-sm text-[#78716c]">An irregular magazine about books, type, and the people who still care.</p>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-24">
        <p className="text-sm uppercase tracking-widest text-[#065f46] mb-4">From issue no. 14</p>
        <h2 className="font-['Fraunces'] text-5xl md:text-6xl leading-[1.05] tracking-tight mb-8">
          The quiet renaissance of small print.
        </h2>
        <p className="text-lg leading-relaxed text-[#44403c] first-letter:text-7xl first-letter:font-['Fraunces'] first-letter:float-left first-letter:mr-3 first-letter:leading-none first-letter:font-semibold">
          There is a scene at the heart of every independent press: a room, a light, a stack of folded signatures
          waiting to be stitched. For most of the last decade we were told this room was dying. The reports were
          exaggerated. What happened instead was quieter and more interesting.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h3 className="font-['Fraunces'] text-2xl border-b border-[#0a0a0a] pb-4 mb-8 tracking-tight">Back issues</h3>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {ISSUES.map((i) => (
            <li key={i.no} className="border-t border-[#78716c]/40 pt-4">
              <div className="flex items-baseline justify-between text-xs uppercase tracking-wider text-[#78716c] mb-2">
                <span>{i.no}</span><span>{i.date}</span>
              </div>
              <p className="font-['Fraunces'] text-xl leading-snug">{i.title}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Write `aesthetic-brutalist.tsx`**

Create `tests/fixtures/react-artifacts/aesthetic-brutalist.tsx`:

```tsx
// @aesthetic: brutalist
// @fonts: Archivo Black:wght@400, JetBrains Mono:wght@400;700

function App() {
  const [selected, setSelected] = useState('unused');
  const DEPS = [
    { name: 'lodash', size: '71kb', used: 2, total: 289, status: 'unused' },
    { name: 'moment', size: '232kb', used: 0, total: 143, status: 'unused' },
    { name: 'rxjs', size: '164kb', used: 47, total: 210, status: 'partial' },
    { name: 'react', size: '42kb', used: 118, total: 118, status: 'keep' },
  ];
  const filter = (d) => selected === 'all' || d.status === selected;

  return (
    <div className="min-h-screen bg-white text-black font-['JetBrains_Mono'] antialiased">
      <header className="border-b-2 border-black px-6 py-4 flex items-center justify-between">
        <div className="font-['Archivo_Black'] text-3xl">DEADWEIGHT</div>
        <span className="text-sm">v1.2.0 / MIT</span>
      </header>

      <section className="px-6 py-16 border-b-2 border-black bg-[#facc15]">
        <h1 className="font-['Archivo_Black'] text-5xl md:text-7xl leading-[0.9] max-w-4xl uppercase">
          Find the 60% of your bundle you don't actually use.
        </h1>
        <p className="mt-6 text-sm max-w-xl">npm install -g deadweight && deadweight scan ./</p>
      </section>

      <section className="px-6 py-8 border-b-2 border-black">
        <div className="flex gap-2 mb-6">
          {['all', 'unused', 'partial', 'keep'].map((f) => (
            <button key={f} type="button" onClick={() => setSelected(f)}
              className={\`px-4 py-2 border-2 border-black text-sm uppercase \${selected === f ? 'bg-black text-white' : 'bg-white text-black hover:bg-[#facc15]'} transition-none\`}>
              {f}
            </button>
          ))}
        </div>
        <table className="w-full border-2 border-black">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left px-4 py-3 text-sm uppercase">package</th>
              <th className="text-right px-4 py-3 text-sm uppercase">size</th>
              <th className="text-right px-4 py-3 text-sm uppercase">used / total</th>
              <th className="text-right px-4 py-3 text-sm uppercase">action</th>
            </tr>
          </thead>
          <tbody>
            {DEPS.filter(filter).map((d) => (
              <tr key={d.name} className="border-t-2 border-black">
                <td className="px-4 py-3 text-sm">{d.name}</td>
                <td className="px-4 py-3 text-sm text-right">{d.size}</td>
                <td className="px-4 py-3 text-sm text-right">{d.used} / {d.total}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <span className={\`px-2 py-1 border-2 border-black \${d.status === 'unused' ? 'bg-[#dc2626] text-white' : d.status === 'partial' ? 'bg-[#facc15] text-black' : 'bg-white'}\`}>
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="px-6 py-4 text-xs flex justify-between">
        <span>no telemetry. no npm scripts. read the code.</span>
        <span>github.com/deadweight/cli</span>
      </footer>
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Write `aesthetic-luxury.tsx`**

Create `tests/fixtures/react-artifacts/aesthetic-luxury.tsx`:

```tsx
// @aesthetic: luxury
// @fonts: DM Serif Display:wght@400, DM Sans:wght@300;400;500;700

function App() {
  return (
    <div className="min-h-screen bg-[#0c0a09] text-[#faf5ef] font-['DM_Sans'] antialiased">
      <header className="mx-auto max-w-6xl px-8 py-8 flex items-center justify-between border-b border-[#d4af37]/20">
        <div className="font-['DM_Serif_Display'] text-3xl tracking-tight text-[#d4af37]">Arcadia Atelier</div>
        <nav className="flex gap-10 text-xs uppercase tracking-[0.3em] text-[#faf5ef]/70">
          <a href="#">The House</a><a href="#">Suites</a><a href="#">Reservations</a>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-8 pt-24 pb-32 text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-[#d4af37] mb-8">Established 1887 · Palazzo Lombardi</p>
        <h1 className="font-['DM_Serif_Display'] text-6xl md:text-8xl leading-[0.92] tracking-tight max-w-4xl mx-auto">
          Fourteen suites.<br />One century of <em className="italic text-[#d4af37]">quiet</em>.
        </h1>
        <p className="mt-10 text-lg text-[#faf5ef]/70 max-w-xl mx-auto font-light leading-relaxed">
          Our family has kept the lights of this house burning since before the railway came through.
          We do not advertise. We respond to letters.
        </p>
        <button type="button" className="mt-12 px-10 py-4 border border-[#d4af37] text-[#d4af37] text-xs uppercase tracking-[0.3em] hover:bg-[#d4af37] hover:text-[#0c0a09] transition-all duration-500">
          Request a room
        </button>
      </section>

      <section className="mx-auto max-w-6xl px-8 py-24 grid grid-cols-1 md:grid-cols-3 gap-12 border-t border-[#d4af37]/20">
        {[
          { title: 'The Palazzo', body: '14 suites set across three floors of the original Lombardi palace, each overlooking the courtyard gardens.' },
          { title: 'The Cellar', body: 'Private tastings of our family reserve — vintages dating to 1942 — by appointment of the sommelier.' },
          { title: 'The Hours', body: 'Breakfast served until noon. Dinner served when hunger asks. Time is soft here.' },
        ].map((s) => (
          <article key={s.title}>
            <h2 className="font-['DM_Serif_Display'] text-3xl tracking-tight mb-4 text-[#d4af37]">{s.title}</h2>
            <p className="text-sm text-[#faf5ef]/70 leading-relaxed font-light">{s.body}</p>
          </article>
        ))}
      </section>

      <footer className="mx-auto max-w-6xl px-8 py-8 border-t border-[#d4af37]/20 text-xs uppercase tracking-[0.3em] text-[#faf5ef]/50 flex justify-between">
        <span>Arcadia Atelier · Como · Italia</span>
        <span>arcadia@lombardi.it</span>
      </footer>
    </div>
  );
}

export default App;
```

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/react-artifacts/aesthetic-editorial.tsx tests/fixtures/react-artifacts/aesthetic-brutalist.tsx tests/fixtures/react-artifacts/aesthetic-luxury.tsx
git commit -m "$(cat <<'EOF'
test(react-artifact): fixtures for editorial, brutalist, luxury directions

- magazine-style brand page with Fraunces drop cap
- CLI dep-audit tool with Archivo Black + acid yellow
- boutique hotel landing with DM Serif Display + gold hairlines

each declares @aesthetic + @fonts directives and demonstrates the
direction's signature moves (palette, typography, motion character)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Four fixtures — playful, industrial, organic, retro-futuristic

**Files:**
- Create: `tests/fixtures/react-artifacts/aesthetic-playful.tsx`
- Create: `tests/fixtures/react-artifacts/aesthetic-industrial.tsx`
- Create: `tests/fixtures/react-artifacts/aesthetic-organic.tsx`
- Create: `tests/fixtures/react-artifacts/aesthetic-retro-futuristic.tsx`

- [ ] **Step 1: Write `aesthetic-playful.tsx`**

Create `tests/fixtures/react-artifacts/aesthetic-playful.tsx`:

```tsx
// @aesthetic: playful
// @fonts: Fredoka:wght@400;500;600;700

function App() {
  const [picked, setPicked] = useState(null);
  const COLORS = [
    { name: 'Bubblegum', hex: '#f472b6' },
    { name: 'Sunshine', hex: '#fde047' },
    { name: 'Grass',     hex: '#84cc16' },
    { name: 'Sky',       hex: '#38bdf8' },
    { name: 'Grape',     hex: '#a855f7' },
    { name: 'Coral',     hex: '#fb7185' },
  ];

  return (
    <div className="min-h-screen bg-[#dcfce7] text-[#166534] font-['Fredoka'] antialiased p-8">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm uppercase font-semibold tracking-wider text-[#f97316] mb-3">step 1 of 3</p>
        <h1 className="text-5xl font-bold leading-[0.95] mb-4">What's your <span className="text-[#f97316]">favorite</span> color?</h1>
        <p className="text-lg text-[#166534]/70 mb-10">Tap one — we'll make everything a little bit this color.</p>

        <div className="grid grid-cols-3 gap-4">
          {COLORS.map((c) => {
            const isPicked = picked?.name === c.name;
            return (
              <button key={c.name} type="button" onClick={() => setPicked(c)}
                className={\`aspect-square rounded-3xl flex flex-col items-center justify-center shadow-[0_6px_0_rgba(22,101,52,0.18)] hover:shadow-[0_3px_0_rgba(22,101,52,0.18)] hover:translate-y-0.5 transition \${isPicked ? 'ring-4 ring-[#166534]' : ''}\`}
                style={{ backgroundColor: c.hex }}>
                <span className="text-4xl mb-2" aria-hidden>{isPicked ? '✓' : ''}</span>
                <span className="text-sm font-semibold">{c.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-10 flex items-center justify-between">
          <div className="flex gap-2">
            <span className="w-10 h-2 rounded-full bg-[#f97316]" />
            <span className="w-2 h-2 rounded-full bg-[#166534]/25" />
            <span className="w-2 h-2 rounded-full bg-[#166534]/25" />
          </div>
          <button type="button" disabled={!picked}
            className={\`px-8 py-3 rounded-full font-semibold transition \${picked ? 'bg-[#f97316] text-white shadow-[0_4px_0_rgba(249,115,22,0.35)] hover:shadow-[0_2px_0_rgba(249,115,22,0.35)] hover:translate-y-0.5' : 'bg-[#166534]/10 text-[#166534]/40 cursor-not-allowed'}\`}>
            next
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Write `aesthetic-industrial.tsx`**

Create `tests/fixtures/react-artifacts/aesthetic-industrial.tsx`:

```tsx
// @aesthetic: industrial
// @fonts: Inter Tight:wght@400;500;700, Space Mono:wght@400;700

const SERVICES = [
  { id: 'api',      name: 'api-gateway',      p99: 42,  rps: 1840, errors: 0.04, status: 'healthy' },
  { id: 'auth',     name: 'auth-service',     p99: 18,  rps: 620,  errors: 0.00, status: 'healthy' },
  { id: 'billing',  name: 'billing-worker',   p99: 186, rps: 24,   errors: 0.82, status: 'degraded' },
  { id: 'search',   name: 'search-indexer',   p99: 94,  rps: 148,  errors: 0.11, status: 'healthy' },
  { id: 'mailer',   name: 'mailer-consumer',  p99: 612, rps: 12,   errors: 4.10, status: 'failing' },
];
const COLOR = { healthy: 'emerald', degraded: 'amber', failing: 'rose' };

function App() {
  const { ChevronRight, Circle } = LucideReact;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Inter_Tight'] antialiased">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-sm font-semibold tracking-wide">observe · production · us-east-1</h1>
        </div>
        <div className="font-['Space_Mono'] text-xs text-slate-400">last tick 00:12s</div>
      </header>

      <section className="px-6 py-8 grid grid-cols-4 gap-px bg-slate-800">
        {[
          { label: 'Services', value: '5', meta: 'up 3 · degraded 1 · failing 1' },
          { label: 'Total RPS', value: '2,644', meta: '↑ 3.2% vs 1h ago' },
          { label: 'Error rate', value: '0.32%', meta: 'SLO 1.00% — within budget' },
          { label: 'p99 latency', value: '186ms', meta: 'p95 94 · p50 28' },
        ].map((s) => (
          <div key={s.label} className="bg-slate-950 px-4 py-5">
            <div className="text-xs uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 font-['Space_Mono'] text-xs text-slate-400">{s.meta}</div>
          </div>
        ))}
      </section>

      <section className="px-6 py-6">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase text-xs tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-medium">service</th>
              <th className="text-right px-3 py-2 font-medium">p99</th>
              <th className="text-right px-3 py-2 font-medium">rps</th>
              <th className="text-right px-3 py-2 font-medium">err%</th>
              <th className="text-left px-3 py-2 font-medium">status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {SERVICES.map((s) => (
              <tr key={s.id} className="border-b border-slate-800 hover:bg-slate-900/60">
                <td className="px-3 py-3 font-['Space_Mono'] text-slate-200">{s.name}</td>
                <td className="px-3 py-3 text-right tabular-nums">{s.p99}ms</td>
                <td className="px-3 py-3 text-right tabular-nums">{s.rps.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular-nums">{s.errors.toFixed(2)}</td>
                <td className="px-3 py-3">
                  <span className={\`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-\${COLOR[s.status]}-500/15 text-\${COLOR[s.status]}-400\`}>
                    <Circle size={8} fill="currentColor" />{s.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-slate-500"><ChevronRight size={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;
```

- [ ] **Step 3: Write `aesthetic-organic.tsx`**

Create `tests/fixtures/react-artifacts/aesthetic-organic.tsx`:

```tsx
// @aesthetic: organic
// @fonts: Fraunces:ital,opsz,wght@0,9..144,300..700, Public Sans:wght@400;500

function App() {
  const PRODUCTS = [
    { id: 'balm',   name: 'Moss Balm',         subtitle: 'oat + calendula',   price: 24 },
    { id: 'rose',   name: 'Rosehip Serum',     subtitle: 'cold-pressed, small batch', price: 38 },
    { id: 'clay',   name: 'Hilltop Clay Mask', subtitle: 'kaolin + chamomile', price: 28 },
  ];

  return (
    <div className="min-h-screen bg-[#faf5ef] text-[#1c1917] font-['Public_Sans'] antialiased">
      <header className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between">
        <div className="font-['Fraunces'] italic text-2xl text-[#3f6212]">Hillhouse & Fern</div>
        <nav className="flex gap-8 text-sm text-[#78716c]">
          <a href="#">Rituals</a><a href="#">Journal</a><a href="#">Cart (0)</a>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-20 pb-24 grid grid-cols-1 md:grid-cols-12 gap-10 items-end">
        <div className="md:col-span-7">
          <p className="text-xs uppercase tracking-widest text-[#c2410c] mb-4">Spring 2026 · small batch</p>
          <h1 className="font-['Fraunces'] text-6xl leading-[1.02] tracking-tight">
            Skincare made <em className="italic text-[#3f6212]">slowly</em>,<br />
            on a hill in Devon.
          </h1>
        </div>
        <div className="md:col-span-5 text-[#44403c] leading-relaxed">
          <p>Three women. One kitchen. Ingredients foraged within a three-mile walk of the front door. We make eighty jars at a time and ship until they're gone.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-8">
        {PRODUCTS.map((p) => (
          <article key={p.id} className="rounded-2xl bg-white/60 border border-[#a8a29e]/30 p-6 shadow-[0_1px_2px_rgba(120,113,108,0.05)] transition-all duration-300 hover:shadow-[0_3px_10px_rgba(120,113,108,0.1)]">
            <div className="aspect-[4/5] rounded-xl bg-[#dcfce7]/50 mb-5" />
            <h2 className="font-['Fraunces'] text-xl">{p.name}</h2>
            <p className="italic text-sm text-[#78716c] mt-1">{p.subtitle}</p>
            <div className="mt-6 flex items-baseline justify-between">
              <span className="font-['Fraunces'] text-lg text-[#3f6212]">\${p.price}</span>
              <button type="button" className="px-5 py-2 rounded-full bg-[#3f6212] text-[#faf5ef] text-sm hover:bg-[#365314] transition-all duration-300">Add to basket</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Write `aesthetic-retro-futuristic.tsx`**

Create `tests/fixtures/react-artifacts/aesthetic-retro-futuristic.tsx`:

```tsx
// @aesthetic: retro-futuristic
// @fonts: Orbitron:wght@400;700;900, Space Mono:wght@400;700

function App() {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTicks((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const LINEUP = [
    { slot: '22:00', name: 'KYRIA',     tag: 'opening · analog' },
    { slot: '23:30', name: 'NULLSPACE', tag: 'live · drone' },
    { slot: '01:00', name: 'AVGUST',    tag: 'headline · techno' },
    { slot: '03:00', name: 'RES_ERROR', tag: 'closing · glitch' },
  ];

  return (
    <div
      className="min-h-screen bg-[#030712] text-[#22d3ee] font-['Space_Mono'] antialiased relative overflow-hidden"
      style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,211,238,0.04) 2px, rgba(34,211,238,0.04) 4px)' }}
    >
      <header className="px-8 py-6 flex items-center justify-between border-b border-[#22d3ee]/40">
        <div className="font-['Orbitron'] font-black text-2xl tracking-[0.3em]" style={{ textShadow: '0 0 12px currentColor' }}>NULL/NULL</div>
        <div className="text-xs tracking-wider">SYS_UPTIME :: {String(ticks).padStart(6, '0')}</div>
      </header>

      <section className="px-8 py-20">
        <p className="text-xs tracking-[0.4em] text-[#e879f9] mb-6">// SIGNAL_04 · 2026.04.26 · 22:00 → 04:00</p>
        <h1 className="font-['Orbitron'] font-black text-7xl md:text-9xl leading-[0.88] tracking-tight" style={{ textShadow: '0 0 20px currentColor, 0 0 40px currentColor' }}>
          A NIGHT FOR<br />
          <span className="text-[#e879f9]" style={{ textShadow: '0 0 20px currentColor' }}>MACHINES</span>
        </h1>
        <p className="mt-6 max-w-xl text-sm tracking-wider">
          Warehouse 04 · Kreuzberg. Six hours of synthesis, broken drum machines, and tape.
        </p>
        <button type="button"
          className="mt-10 px-8 py-3 border border-[#22d3ee] text-[#22d3ee] text-sm tracking-[0.3em] hover:bg-[#22d3ee] hover:text-[#030712] hover:shadow-[0_0_30px_#22d3ee] transition">
          GET.TICKET →
        </button>
      </section>

      <section className="px-8 py-12 border-t border-[#22d3ee]/40">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-[#22d3ee]/30">
          {LINEUP.map((s) => (
            <div key={s.slot} className="bg-[#030712] px-5 py-6">
              <div className="text-xs tracking-widest text-[#e879f9]">{s.slot}</div>
              <div className="font-['Orbitron'] font-bold text-2xl mt-2" style={{ textShadow: '0 0 8px currentColor' }}>{s.name}</div>
              <div className="text-xs mt-1 text-[#22d3ee]/70">{s.tag}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
```

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/react-artifacts/aesthetic-playful.tsx tests/fixtures/react-artifacts/aesthetic-industrial.tsx tests/fixtures/react-artifacts/aesthetic-organic.tsx tests/fixtures/react-artifacts/aesthetic-retro-futuristic.tsx
git commit -m "$(cat <<'EOF'
test(react-artifact): fixtures for playful, industrial, organic, retro-futuristic

- kids app onboarding with Fredoka + pastel green + vivid orange
- services observe board with Inter Tight + Space Mono + slate-950
- skincare brand page with Fraunces italic + moss/terracotta/bone
- warehouse event page with Orbitron + cyan/magenta neon on near-black

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Roundtrip test — every fixture parses + validates

**Files:**
- Create: `tests/unit/react-artifact/fixtures.test.ts`

- [ ] **Step 1: Write the roundtrip test**

Create `tests/unit/react-artifact/fixtures.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"
import {
  parseDirectives,
  buildFontLinks,
  AESTHETIC_DIRECTIONS,
  type AestheticDirection,
} from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"

const FIXTURES_DIR = join(__dirname, "..", "..", "fixtures", "react-artifacts")

function readFixture(direction: AestheticDirection): string {
  return readFileSync(join(FIXTURES_DIR, `aesthetic-${direction}.tsx`), "utf-8")
}

describe("react-artifact fixtures — roundtrip", () => {
  for (const dir of AESTHETIC_DIRECTIONS) {
    describe(`aesthetic-${dir}.tsx`, () => {
      const content = readFixture(dir)

      it("declares the matching @aesthetic directive on line 1", () => {
        const parsed = parseDirectives(content)
        expect(parsed.aesthetic).toBe(dir)
      })

      it("validates without errors", () => {
        const result = validateArtifactContent("application/react", content)
        expect(
          result.errors,
          `errors for ${dir}: ${result.errors.join(" | ")}`
        ).toEqual([])
        expect(result.ok).toBe(true)
      })

      it("produces a Google Fonts link block for buildSrcdoc to inject", () => {
        const parsed = parseDirectives(content)
        const links = buildFontLinks(dir, parsed.fonts)
        expect(links).toContain("https://fonts.googleapis.com/css2?")
        expect(links).toContain('rel="stylesheet"')
      })
    })
  }
})
```

- [ ] **Step 2: Run the roundtrip tests**

Run: `bun test tests/unit/react-artifact/fixtures.test.ts`

Expected: 7 directions × 3 assertions = 21 tests green.

- [ ] **Step 3: If any fixture fails, fix the fixture in place**

Likely failure modes and fixes:
- Validator flags malformed JSX → check braces / unclosed tags in the fixture.
- Validator soft-warns on palette mismatch in non-industrial direction → adjust the palette classes so `slate-*` / `indigo-*` density is < 6. The fixture for `industrial` is the only one allowed dense slate/indigo.
- Warning about missing serif in editorial/luxury → ensure `@fonts` declares `Fraunces`, `DM Serif`, `Cormorant`, `Playfair`, `Newsreader`, `Crimson Pro`, or `Lora`.

- [ ] **Step 4: Re-run validator suite + fixture suite together to catch cross-interaction**

Run:
```bash
bun test tests/unit/validate-artifact.test.ts tests/unit/react-artifact/
```

Expected: all tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/react-artifact/fixtures.test.ts
git commit -m "$(cat <<'EOF'
test(react-artifact): roundtrip test across all 7 direction fixtures

- every fixture declares matching @aesthetic directive
- every fixture validates without errors (hard or soft-warn surfacing)
- every fixture produces a buildFontLinks output ready for buildSrcdoc

serves as the regression firewall when the prompt, parser, or validator
drift — any break catches 7 different shapes at once

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Docs & Rollback

### Task 13: Update `artifacts-capabilities.md` section 2 (React)

**Files:**
- Modify: `docs/artifact-plans/artifacts-capabilities.md`

- [ ] **Step 1: Update the section 2 block to reflect the aesthetic menu**

Open `docs/artifact-plans/artifacts-capabilities.md`. Find the `## 2. React Artifact — application/react` heading (around line 94) and replace the section body (down to the next `## 3. SVG Artifact` heading) with:

```markdown
## 2. React Artifact — `application/react`

**Label:** React Component
**Ringkasan:** Single React 18 component, transpiled by Babel, rendered di iframe dengan pre-injected globals. **Upgraded 2026-04-24:** aesthetic direction menu + dynamic Google Fonts — no more hard-locked Inter/slate+indigo default.

### Runtime Environment

**Pre-destructured React APIs** (available langsung, no import needed):
```jsx
const {
  useState, useEffect, useRef, useMemo, useCallback, useReducer,
  useContext, useId, useTransition, useDeferredValue, useLayoutEffect,
  useSyncExternalStore, useInsertionEffect, createContext, forwardRef,
  memo, Fragment, Suspense, lazy, startTransition, createElement,
  isValidElement, Children, cloneElement
} = React;
```

**Global Libraries — window.global syntax:**

| Library | Symbol | Version | Usage | Notes |
|---------|--------|---------|-------|-------|
| **Recharts** | `Recharts` | 2 | `<Recharts.LineChart>`, `<Recharts.BarChart>`, `<Recharts.PieChart>`, `<Recharts.AreaChart>`, `<Recharts.ResponsiveContainer>`, `<Recharts.Tooltip>` | Charts ONLY |
| **Lucide React** | `LucideReact` | 0.454 | `<LucideReact.ArrowRight>`, `<LucideReact.Check>` | Icons as React components |
| **Framer Motion** | `Motion` | 11 | `Motion.motion.div`, `Motion.AnimatePresence` | Animations & transitions |
| **Tailwind CSS** | – | v3 CDN | Classes (`.bg-slate-50`, `.text-indigo-600`) | Styling |

**Sandbox:** `allow-scripts` only — no real form POST, no `window.open`, no navigation. Mock all data.

### Directives (NEW — 2026-04-24)

Line 1 is REQUIRED: `// @aesthetic: <direction>`. Line 2 is OPTIONAL: `// @fonts: Family:spec, Family:spec` (max 3 families).

Valid directions (7):
`editorial | brutalist | luxury | playful | industrial | organic | retro-futuristic`

Renderer loads fonts dynamically from `fonts.googleapis.com` (only host whitelist); malformed `@fonts` falls back to direction defaults. Validator hard-errors on missing `@aesthetic`, unknown value, or malformed `@fonts`. Soft-warns on:
- Non-industrial direction + ≥ 6 `slate-*` / `indigo-*` references (palette-direction mismatch)
- Editorial/luxury direction without a known serif family in `@fonts` (font-direction mismatch)
- Industrial direction using `Motion.motion` / `Motion.AnimatePresence` (motion-in-industrial)

### Aesthetic Direction Menu

| Direction | When to pick | Default fonts |
|---|---|---|
| editorial | articles, brand pages, storytelling, long-form | Fraunces + Inter |
| brutalist | indie tools, manifestos, dev products, "raw" | Space Grotesk + JetBrains Mono |
| luxury | premium, hospitality, fashion | DM Serif Display + DM Sans |
| playful | onboarding, kids, creative tools | Fredoka |
| industrial | dashboards, admin, monitoring | Inter Tight + Space Mono |
| organic | wellness, food, crafts | Fraunces + Public Sans |
| retro-futuristic | gaming, sci-fi, events | VT323 + Space Mono |

Each direction ships a full design system (palette, spacing, component conventions, motion character). See [src/lib/prompts/artifacts/react.ts](../../src/lib/prompts/artifacts/react.ts) for the canonical spec. Prompt fixtures cover 4 directions; test fixtures at [tests/fixtures/react-artifacts/](../../tests/fixtures/react-artifacts/) cover all 7.

### Chart Types via Recharts
Same as before: `<LineChart>`, `<BarChart>` (also `layout="vertical"`), `<PieChart>`, `<AreaChart>`, with `<XAxis>`, `<YAxis>`, `<CartesianGrid>`, `<Legend>`, `<Tooltip>`, `<ResponsiveContainer>`.

### Anti-Patterns ❌
- ❌ Missing `// @aesthetic:` directive on line 1 (hard-error)
- ❌ Unknown aesthetic direction name (hard-error)
- ❌ Malformed `@fonts` spec (hard-error)
- ❌ More than 3 font families (hard-error)
- ❌ Mixing directions within one artifact
- ❌ Silently defaulting to slate+indigo without `@aesthetic: industrial` (palette-mismatch warn)
- ❌ `import { Card } from 'shadcn/ui'` — NOT available (Phase 2 will ship `RantaiUI` bundle)
- ❌ `import './styles.css'`
- ❌ `class X extends React.Component`
- ❌ `document.getElementById()` / `document.querySelector()`
- ❌ Real `fetch()` calls
- ❌ Truncation
```

Update the top-of-file TL;DR matrix to reflect that React now has typography freedom. Find the matrix around lines 10-31 and edit the "React" column rows where applicable:

Change the "Inline SVG" row's React column to remain `✓` (unchanged).
Add a new row right after "Mermaid charts":
```
| **Aesthetic menu (7 dir)** | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Dynamic Google Fonts** | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
```

- [ ] **Step 2: Update the Summary section at the bottom**

Find the "Key discoveries" block near the end (around line 1025). Replace the React bullet:

Old: `✓ React libraries: Recharts, Framer Motion, Lucide (pre-injected globals, no imports)`

New: `✓ React (2026-04-24): upgraded dengan 7 aesthetic directions (editorial, brutalist, luxury, playful, industrial, organic, retro-futuristic) + dynamic Google Fonts via // @aesthetic: + // @fonts: directives. Validator hard-errors on missing directive, soft-warns on palette/font/motion direction mismatch. Zero new runtime deps, zero server-side bundler. Recharts + Framer Motion + Lucide tetap pre-injected globals.`

- [ ] **Step 3: Commit**

```bash
git add docs/artifact-plans/artifacts-capabilities.md
git commit -m "$(cat <<'EOF'
docs(capabilities): reflect react aesthetic menu + directive syntax

- section 2 rewritten around 7-direction menu + directive contract
- TL;DR matrix gains aesthetic-menu + dynamic-fonts rows
- summary bullet captures 2026-04-24 upgrade scope

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Rollback env flag `ARTIFACT_REACT_AESTHETIC_REQUIRED`

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Modify: `.env.example` (create if missing)
- Modify: `tests/unit/validate-artifact.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/validate-artifact.test.ts`:

```typescript
describe("validateArtifactContent — application/react — rollback flag", () => {
  const BODY_WITHOUT_DIRECTIVE = `function App() { return <div/> }\nexport default App`
  const orig = process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED

  afterEach(() => {
    if (orig === undefined) delete process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED
    else process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED = orig
  })

  it("hard-errors on missing directive by default (flag unset)", () => {
    delete process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED
    const r = validateArtifactContent("application/react", BODY_WITHOUT_DIRECTIVE)
    expect(r.ok).toBe(false)
  })

  it("hard-errors on missing directive when flag='true' (explicit)", () => {
    process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED = "true"
    const r = validateArtifactContent("application/react", BODY_WITHOUT_DIRECTIVE)
    expect(r.ok).toBe(false)
  })

  it("passes when flag='false' even without directive", () => {
    process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED = "false"
    const r = validateArtifactContent("application/react", BODY_WITHOUT_DIRECTIVE)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/@aesthetic.*missing/i)
  })
})
```

Note the `afterEach` import — add `afterEach` to the vitest imports at the top of the file if not already there:

```typescript
import { describe, it, expect, afterEach } from "vitest"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/validate-artifact.test.ts -t "rollback flag"`

Expected: the "passes when flag='false'" case fails (validator still hard-errors).

- [ ] **Step 3: Implement the flag check in `validateReact`**

In `src/lib/tools/builtin/_validate-artifact.ts`, update the directive-enforcement block at the top of `validateReact`. Wrap the hard-error branches with the flag check:

```typescript
  // 0. Directive enforcement
  const directives = parseDirectives(content)
  const aestheticRequired =
    process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"

  if (!directives.rawAestheticLine) {
    const message =
      'Missing "// @aesthetic: <direction>" directive on line 1. Pick one of: ' +
      AESTHETIC_DIRECTIONS.join(", ") +
      ". See prompt rules for direction selection heuristic."
    if (aestheticRequired) {
      errors.push(message)
      return { ok: false, errors, warnings }
    } else {
      warnings.push(message)
      // Continue without aesthetic — soft-warns below are skipped because
      // directives.aesthetic is null.
    }
  } else if (!directives.aesthetic) {
    const badValue = directives.rawAestheticLine
      .replace(/^\s*\/\/\s*@aesthetic\s*:\s*/, "")
      .trim()
    const message =
      `Unknown aesthetic direction "${badValue}". Valid: ` +
      AESTHETIC_DIRECTIONS.join(", ") +
      "."
    if (aestheticRequired) {
      errors.push(message)
      return { ok: false, errors, warnings }
    } else {
      warnings.push(message)
    }
  }

  // @fonts directive checks remain hard-error regardless of flag — malformed
  // URLs are a security / runtime concern, not a policy concern.
  if (directives.fonts) {
    if (directives.fonts.length > MAX_FONT_FAMILIES) {
      errors.push(
        `Too many font families in @fonts directive (${directives.fonts.length}). Max is ${MAX_FONT_FAMILIES}.`
      )
      return { ok: false, errors, warnings }
    }
    const bad = directives.fonts.filter((s) => !validateFontSpec(s))
    if (bad.length > 0) {
      errors.push(
        `Malformed @fonts directive. Expected comma-separated Google Fonts specs like ` +
          `"Fraunces:wght@300..900, Inter:wght@400;500;700". Bad: ${bad
            .map((s) => `"${s}"`)
            .join(", ")}.`
      )
      return { ok: false, errors, warnings }
    }
  }
```

And update the soft-warn helper call site — when `directives.aesthetic` is null (flag-off path), skip the heuristics:

```typescript
  if (directives.aesthetic) {
    appendAestheticWarnings(content, directives.aesthetic, directives.fonts, warnings)
  }
```

- [ ] **Step 4: Run the rollback test**

Run: `bun test tests/unit/validate-artifact.test.ts -t "rollback flag"`

Expected: all three cases green.

- [ ] **Step 5: Document the flag in `.env.example`**

Check if `.env.example` exists:

```bash
ls /home/shiro/rantai/RantAI-Agents/.env.example 2>&1
```

If it exists, append:

```bash
# Artifact — React quality upgrade (2026-04-24)
# Set to "false" to disable hard-error on missing `// @aesthetic:` directive
# in react artifacts. Use only as an emergency rollback; normal operation
# leaves this unset (defaults to true = enforcement on).
ARTIFACT_REACT_AESTHETIC_REQUIRED=
```

If it does not exist, create it with just this block. **Do not copy values from existing `.env` files — this file is for documentation only.**

- [ ] **Step 6: Run the full validator suite once more**

Run: `bun test tests/unit/validate-artifact.test.ts tests/unit/react-artifact/`

Expected: all tests green across both directories.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts tests/unit/validate-artifact.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat(validator): ARTIFACT_REACT_AESTHETIC_REQUIRED rollback env flag

- default (unset) and "true" → missing @aesthetic = hard-error
- "false" → missing @aesthetic = soft-warn, artifact still creates
- @fonts directive validation stays hard-error regardless of flag
  (security concern, not a policy one)
- .env.example documents the flag with "emergency rollback only" note

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `bun test`

Expected: every test green across the whole repo. If other suites fail due to unrelated flakiness, re-run just those, but do not ignore a hard failure.

- [ ] **Step 2: Run type-check**

Run: `bunx tsc --noEmit`

Expected: no new type errors introduced by this work. Pre-existing errors in unrelated files are out of scope.

- [ ] **Step 3: Re-render 5 existing production React artifacts as a manual regression spot-check**

Open a scratch script (or run in the db console):

```typescript
// scripts/audit-react-artifacts.ts
import { prisma } from "@/lib/prisma"

const docs = await prisma.document.findMany({
  where: { artifactType: "application/react" },
  orderBy: { createdAt: "desc" },
  take: 5,
  select: { id: true, title: true, content: true },
})

for (const d of docs) {
  const first = d.content.split("\n")[0]
  const hasDirective = /^\s*\/\/\s*@aesthetic\s*:/.test(first)
  console.log(d.id, "·", d.title, "·", hasDirective ? "HAS directive" : "NO directive — would need industrial prefix")
}
```

Run: `bun run scripts/audit-react-artifacts.ts` (if a runner is wired) or adapt to an existing script entry point.

For any "NO directive" artifact, the design doc's rollback plan (Section 13) covers what happens: if the user re-edits that artifact, validator will hard-error and the LLM will be instructed (via tool error message) to add the directive on the next retry. Existing stored artifacts are not mutated.

- [ ] **Step 4: Final commit (if any scratch files were created)**

If you wrote `scripts/audit-react-artifacts.ts` as a durable tool, commit it:

```bash
git add scripts/audit-react-artifacts.ts
git commit -m "$(cat <<'EOF'
chore: audit script for existing React artifacts' directive coverage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Otherwise discard it.

- [ ] **Step 5: Push and open PR**

Confirm with the user before pushing. If approved:

```bash
git push -u origin HEAD
gh pr create --title "feat(react-artifact): phase-1 aesthetic menu + directive-driven fonts" --body "$(cat <<'EOF'
## Summary

Phase 1 of the React artifact quality upgrade (see design doc). Replaces the hard-coded slate+indigo+Inter default with a 7-direction aesthetic menu. Line-comment directives (\`// @aesthetic:\`, \`// @fonts:\`) drive dynamic Google Fonts injection in the iframe. Validator hard-errors on missing/invalid \`@aesthetic\`; soft-warns on palette/font/motion direction mismatch.

- **Zero new runtime dependencies.** Zero new npm packages. Zero server-side bundler changes.
- Directive parser + font-link builder live in \`_react-directives.ts\`; fully unit-tested.
- Validator extended with directive checks + 3 soft-warn heuristics.
- Renderer threads parsed directives through \`preprocessCode\` → \`buildSrcdoc\`; hard-coded Inter link removed.
- Prompt fully rewritten: 7-direction menu, selection heuristic, per-direction design systems, 4 direction-diverse examples.
- 7 fixture artifacts (\`tests/fixtures/react-artifacts/aesthetic-*.tsx\`) serve as regression firewall.
- Rollback env flag \`ARTIFACT_REACT_AESTHETIC_REQUIRED=false\` downgrades missing-directive hard-error to soft-warn.

**Design:** [docs/artifact-plans/2026-04-24-react-quality-upgrade-design.md](docs/artifact-plans/2026-04-24-react-quality-upgrade-design.md)
**Plan:** [docs/artifact-plans/2026-04-24-react-quality-upgrade-plan.md](docs/artifact-plans/2026-04-24-react-quality-upgrade-plan.md)

## Test plan
- [ ] \`bun test tests/unit/react-artifact/\` — directive parser + fixtures roundtrip
- [ ] \`bun test tests/unit/validate-artifact.test.ts\` — hard-error + soft-warn suites
- [ ] \`bunx tsc --noEmit\` — no new type errors
- [ ] Manual: render each of the 7 fixture artifacts in dev server, verify correct fonts load and direction-appropriate styling
- [ ] Manual: create an artifact without \`@aesthetic\` directive, verify validator hard-errors with a clear message
- [ ] Manual: create an artifact with \`// @aesthetic: editorial\` but heavy slate/indigo usage, verify soft-warn surfaces

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (filled in post-write)

**1. Spec coverage check:**
- §4 Phase 1 Scope 8 criteria ✓
  - (1) `@aesthetic` parse + validator → Tasks 2, 4
  - (2) `@fonts` parse + link injection → Tasks 2, 3, 7
  - (3) Prompt exposes 7 directions → Task 8
  - (4) Four direction-diverse examples in prompt → Task 9
  - (5) Hard-error on missing `@aesthetic` + soft-warn on mismatch → Tasks 4, 5
  - (6) Seven fixture artifacts → Tasks 10, 11
  - (7) `artifacts-capabilities.md` section 2 updated → Task 13
  - (8) Zero existing-artifact regression (manual spot-check) → Final Verification Step 3
- §7 Validator Hard Errors + Soft Warnings → Tasks 4, 5
- §8 Renderer Font Injection (with fallback + whitelist) → Tasks 3, 6, 7
- §9 Prompt Rewrite (rules + 4 examples) → Tasks 8, 9
- §10 Files to Change — every modified file touched; every new file created
- §11 Test Strategy — directive-parser tests (Tasks 1–3), validator tests (Tasks 4–5), fixtures (Tasks 10–11), roundtrip (Task 12), manual regression (Final Step 3)
- §13 Rollback Plan — Task 14 ships the env flag + documents it

**2. Placeholder scan:**
- All code steps contain actual code, not "TODO: implement". ✓
- No "similar to task N" — code is repeated where needed. ✓
- No "add appropriate error handling" — specific error messages written out. ✓
- No "write tests for the above" without test code — every test step has the test content. ✓

**3. Type consistency:**
- `AestheticDirection`, `ParsedDirectives`, `parseDirectives`, `validateFontSpec`, `buildFontLinks`, `AESTHETIC_DIRECTIONS`, `DEFAULT_FONTS_BY_DIRECTION`, `MAX_FONT_FAMILIES` — all names used consistently across Tasks 1, 2, 3, 4, 5, 6, 7, 12.
- `appendAestheticWarnings` signature `(content, aesthetic, fonts, warnings)` matches call sites in Task 5 and Task 14.
- Font spec regex and its behavior match across Tasks 3 (definition), 4 (validator integration), 12 (fixture check).

No gaps found. Plan ready for execution.

---

## Execution Handoff

**Plan complete and saved to** `docs/artifact-plans/2026-04-24-react-quality-upgrade-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
