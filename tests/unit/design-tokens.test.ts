import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { contrastRatio } from "@/lib/design-tokens/contrast"
import { LIGHT_SELECTOR, RADIUS_STEPS, renderTokensCss } from "@/lib/design-tokens/render"
import { resolveColor } from "@/lib/design-tokens/resolve"
import { aliasTarget, type DesignTokens, type ThemeId } from "@/lib/design-tokens/schema"

const root = path.resolve(__dirname, "../..")
const tokens = JSON.parse(readFileSync(path.join(root, "src/styles/tokens.json"), "utf8")) as DesignTokens
const css = renderTokensCss(tokens)
const THEMES: ThemeId[] = ["light", "dark"]

/** The declarations inside the first block opened by `selector {`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `no "${selector}" block`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf("\n}", start))
}

function toPx(length: string): number {
  if (length.endsWith("rem")) return parseFloat(length) * 16
  if (length.endsWith("px")) return parseFloat(length)
  throw new Error(`unsupported length ${length}`)
}

describe("tokens.css", () => {
  it("matches tokens.json (run `bun run tokens` after changing the JSON)", () => {
    expect(readFileSync(path.join(root, "src/styles/tokens.css"), "utf8")).toBe(css)
  })

  it("declares the light values for `.theme-light` too, so a subtree can stay light", () => {
    expect(LIGHT_SELECTOR).toContain(".theme-light")
    expect(block(LIGHT_SELECTOR)).toContain("--background:")
  })

  it("re-declares every alias in .dark, so nested dark subtrees resolve it there", () => {
    const dark = block(".dark")
    const aliases = tokens.color.tokens.filter((t) => typeof t.value === "string" && aliasTarget(t.value))
    expect(aliases.length).toBeGreaterThan(0)
    for (const alias of aliases) expect(dark).toContain(`--${alias.name}: var(--${aliasTarget(alias.value as string)});`)
  })

  it("keeps shadow colours as separate variables so Tailwind's shadow-colour modifiers apply", () => {
    const theme = block("@theme inline")
    for (const shadow of tokens.shadow.tokens) {
      const value = new RegExp(`--${shadow.name}: (.*);`).exec(theme)?.[1] ?? ""
      for (const layer of value.split(/,(?![^(]*\))/)) {
        expect(layer.trim(), shadow.name).toMatch(/^[-\d.a-z ]+ var\(--elevation-[a-z0-9]+-\d\)$/)
      }
    }
  })

  it("derives every radius step from the base so a rebrand changes one value", () => {
    const basePx = toPx(tokens.radius.tokens.find((t) => t.name === "radius")!.value as string)
    for (const token of tokens.radius.tokens.filter((t) => t.name !== "radius")) {
      const step = RADIUS_STEPS[token.name]
      const rendered = "fixed" in step ? step.fixed : `${basePx + step.offset}px`
      expect(`${token.name}: ${rendered}`).toBe(`${token.name}: ${token.value}`)
    }
  })
})

/**
 * The contrast each token's `usage` note promises, checked in both themes. WCAG AA: 4.5:1 for
 * text, 3:1 for control boundaries and status icons; focus rings and body text keep the margin
 * their notes state. A token edit that breaks one fails here.
 */
const SURFACES = ["background", "card", "popover", "sidebar", "muted", "accent", "canvas"]
const PROMISES: { fg: string; on: string[]; min: number }[] = [
  { fg: "foreground", on: SURFACES, min: 12 },
  { fg: "muted-foreground", on: [...SURFACES, "sidebar-accent", "secondary"], min: 4.5 },
  { fg: "primary", on: ["background", "card", "muted"], min: 4.5 },
  { fg: "primary-foreground", on: ["primary", "primary-hover"], min: 4.5 },
  { fg: "primary-subtle-foreground", on: ["primary-subtle"], min: 4.5 },
  { fg: "link", on: ["background", "card", "popover", "sidebar", "muted"], min: 4.5 },
  { fg: "destructive", on: ["background", "card", "destructive-subtle"], min: 4.5 },
  { fg: "destructive-foreground", on: ["destructive"], min: 4.5 },
  { fg: "destructive-subtle-foreground", on: ["destructive-subtle"], min: 4.5 },
  { fg: "success", on: ["background", "card"], min: 4.5 },
  { fg: "success", on: ["success-subtle"], min: 3 },
  { fg: "success-foreground", on: ["success"], min: 4.5 },
  { fg: "success-subtle-foreground", on: ["success-subtle"], min: 4.5 },
  { fg: "warning", on: ["background", "card"], min: 4.5 },
  { fg: "warning", on: ["warning-subtle"], min: 3 },
  { fg: "warning-subtle-foreground", on: ["warning-subtle"], min: 4.5 },
  { fg: "plan-foreground", on: ["plan"], min: 8 },
  { fg: "input", on: ["background", "card"], min: 3 },
  { fg: "ring", on: SURFACES, min: 5 },
]

describe.each(THEMES)("contrast in the %s theme", (theme) => {
  const cases = PROMISES.flatMap(({ fg, on, min }) => on.map((bg) => ({ fg, bg, min })))
  it.each(cases)("$fg on $bg is at least $min:1", ({ fg, bg, min }) => {
    const ratio = contrastRatio(resolveColor(tokens, fg, theme), resolveColor(tokens, bg, theme))
    expect(ratio).toBeGreaterThanOrEqual(min)
  })
})
