import { readFileSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import { contrastRatio } from "@/lib/design-tokens/contrast"
import { resolveColor } from "@/lib/design-tokens/resolve"
import { RADIUS_STEPS, renderTokensCss } from "@/lib/design-tokens/render"
import type { DesignTokens, ThemeId } from "@/lib/design-tokens/schema"

const root = path.resolve(__dirname, "../..")
const tokens = JSON.parse(readFileSync(path.join(root, "src/styles/tokens.json"), "utf8")) as DesignTokens
const THEMES: ThemeId[] = ["light", "dark"]

describe("tokens.css", () => {
  it("matches tokens.json (run `bun run tokens` after changing the JSON)", () => {
    const committed = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8")
    expect(committed).toBe(renderTokensCss(tokens))
  })

  it("derives every radius step from the base so a rebrand changes one value", () => {
    const basePx = parseFloat(tokens.radius.tokens.find((t) => t.name === "radius")!.value as string) * 16
    for (const token of tokens.radius.tokens.filter((t) => t.name !== "radius")) {
      const step = RADIUS_STEPS[token.name]
      const rendered = "fixed" in step ? step.fixed : `${basePx + step.offset}px`
      expect(`${token.name}: ${rendered}`).toBe(`${token.name}: ${token.value}`)
    }
  })
})

/**
 * The contrast each token's `usage` note promises, checked in both themes. WCAG AA: 4.5:1 for
 * text, 3:1 for control boundaries and focus rings. A token edit that breaks one fails here.
 */
const SURFACES = ["background", "card", "popover", "sidebar", "muted", "accent", "canvas"]
const PROMISES: { fg: string; on: string[]; min: number }[] = [
  { fg: "foreground", on: SURFACES, min: 12 },
  { fg: "muted-foreground", on: ["background", "card", "sidebar", "muted", "accent"], min: 4.5 },
  { fg: "primary-foreground", on: ["primary", "primary-hover"], min: 4.5 },
  { fg: "primary-subtle-foreground", on: ["primary-subtle"], min: 4.5 },
  { fg: "link", on: ["background", "card", "muted"], min: 4.5 },
  { fg: "destructive", on: ["background", "card"], min: 4.5 },
  { fg: "destructive-foreground", on: ["destructive"], min: 4.5 },
  { fg: "destructive-subtle-foreground", on: ["destructive-subtle"], min: 4.5 },
  { fg: "success", on: ["background", "card"], min: 4.5 },
  { fg: "success-foreground", on: ["success"], min: 4.5 },
  { fg: "success-subtle-foreground", on: ["success-subtle"], min: 4.5 },
  { fg: "warning", on: ["background", "card"], min: 4.5 },
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
