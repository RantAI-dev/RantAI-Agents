import { aliasTarget, valueIn, type DesignTokens, type NamedToken, type ThemeId } from "./schema"
import { shadowColors, shadowValue } from "./shadows"

/**
 * Renders `tokens.json` as the CSS the app imports (`src/styles/tokens.css`).
 *
 * Colours and shadows become CSS variables in `:root` (light) and `.dark`, named exactly as
 * shadcn's slots, and are mapped into Tailwind v4's theme in `@theme inline` so utilities
 * like `bg-primary-subtle` and `shadow-md` follow the active theme. Type styles become
 * `text-<name>` utilities carrying size, line height, weight and tracking.
 */

export const GENERATED_HEADER =
  "/* Generated from src/styles/tokens.json by scripts/design-tokens.ts. Do not edit: run `bun run tokens`. */"

/**
 * Radius steps are derived from the base `--radius` (as shadcn does) so a rebrand changes one
 * value: `offset` is added to the base, `fixed` ignores it. The test checks each step still
 * equals its token value at the shipped base.
 */
export type RadiusStep = { offset: number } | { fixed: string }

export const RADIUS_STEPS: Record<string, RadiusStep> = {
  "radius-xs": { fixed: "4px" },
  "radius-sm": { offset: -4 },
  "radius-md": { offset: -2 },
  "radius-lg": { offset: 0 },
  "radius-xl": { offset: 4 },
  "radius-2xl": { offset: 8 },
  "radius-full": { fixed: "9999px" },
}

function radiusCss(step: RadiusStep): string {
  if ("fixed" in step) return step.fixed
  if (step.offset === 0) return "var(--radius)"
  return `calc(var(--radius) ${step.offset < 0 ? "-" : "+"} ${Math.abs(step.offset)}px)`
}

function cssValue(raw: string): string {
  const target = aliasTarget(raw)
  return target ? `var(--${target})` : raw
}

function declaration(name: string, value: string): string {
  return `  --${name}: ${value};`
}

function themed(tokens: NamedToken[], theme: ThemeId, prefix = ""): string[] {
  return tokens.map((t) => declaration(prefix + t.name, cssValue(valueIn(t, theme))))
}

function varies(token: NamedToken): boolean {
  return typeof token.value !== "string" && token.value.light !== token.value.dark
}

/**
 * Aliases are re-declared in `.dark`: a custom property resolves `var()` where it is declared,
 * so an alias set only on `:root` would keep the light value inside a nested `.dark` subtree.
 */
function isAlias(token: NamedToken): boolean {
  return typeof token.value === "string" && aliasTarget(token.value) !== null
}

/** Light values also apply under `.theme-light`, which keeps a subtree light inside a dark app. */
export const LIGHT_SELECTOR = ":root, .theme-light"

function colorBlock(selector: string, t: DesignTokens, theme: ThemeId, colors: NamedToken[]): string[] {
  return [
    `${selector} {`,
    ...themed(colors, theme),
    ...t.shadow.tokens.flatMap((s) => shadowColors(s, theme).map(([name, value]) => declaration(name, value))),
    "}",
  ]
}

function rootBlock(t: DesignTokens): string[] {
  const radiusBase = t.radius.tokens.find((r) => r.name === "radius")
  if (!radiusBase) throw new Error("tokens.json: radius.tokens needs a base `radius`")
  return [
    ":root {",
    declaration("radius", valueIn(radiusBase, "light")),
    ...t.duration.tokens.map((d) => declaration(d.name, valueIn(d, "light"))),
    ...t.size.tokens.map((s) => declaration(s.name, valueIn(s, "light"))),
    ...t.zIndex.tokens.map((z) => declaration(z.name, valueIn(z, "light"))),
    "}",
  ]
}

function typeScale(t: DesignTokens): string[] {
  return t.type.groups.flatMap((g) =>
    g.styles.flatMap((s) => [
      declaration(`text-${s.name}`, s.fontSize),
      declaration(`text-${s.name}--line-height`, s.lineHeight),
      declaration(`text-${s.name}--font-weight`, String(s.fontWeight)),
      ...(s.letterSpacing ? [declaration(`text-${s.name}--letter-spacing`, s.letterSpacing)] : []),
    ]),
  )
}

function themeBlock(t: DesignTokens): string[] {
  const radii = t.radius.tokens
    .filter((r) => r.name !== "radius")
    .map((r) => {
      const step = RADIUS_STEPS[r.name]
      if (!step) throw new Error(`tokens.json: no radius step for ${r.name}`)
      return declaration(r.name, radiusCss(step))
    })
  return [
    "@theme inline {",
    ...t.color.tokens.map((c) => declaration(`color-${c.name}`, `var(--${c.name})`)),
    ...radii,
    ...t.shadow.tokens.map((s) => declaration(s.name, shadowValue(s))),
    ...t.easing.tokens.map((e) => declaration(e.name, valueIn(e, "light"))),
    // `size-sidebar` → `w-sidebar`, `h-header`, `size-control`, `max-w-thread`.
    ...t.size.tokens.map((s) => declaration(s.name.replace(/^size-/, "spacing-"), `var(--${s.name})`)),
    ...typeScale(t),
    "}",
  ]
}

export function renderTokensCss(tokens: DesignTokens): string {
  const colors = tokens.color.tokens
  return [
    GENERATED_HEADER,
    "",
    ...colorBlock(LIGHT_SELECTOR, tokens, "light", colors),
    "",
    ...colorBlock(".dark", tokens, "dark", colors.filter((c) => varies(c) || isAlias(c))),
    "",
    ...rootBlock(tokens),
    "",
    ...themeBlock(tokens),
    "",
  ].join("\n")
}
