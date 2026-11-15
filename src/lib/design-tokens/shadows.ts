import { valueIn, type NamedToken, type ThemeId } from "./schema"

/**
 * Shadows are emitted with literal geometry and only their colours as per-theme variables
 * (`--elevation-<step>-<layer>`). Tailwind can then wrap each colour in `--tw-shadow-color`, so
 * `shadow-md shadow-primary/10` still tints the shadow; a whole-value `var()` would not.
 */

interface ShadowLayer {
  geometry: string
  color: string
}

const LAYER_SEPARATOR = /,(?![^(]*\))/
const LAYER = /^(.*?)\s+((?:rgba?|hsla?|oklch)\([^)]*\)|#[0-9a-f]{3,8})$/i

function layers(value: string, token: string): ShadowLayer[] {
  return value.split(LAYER_SEPARATOR).map((raw) => {
    const m = LAYER.exec(raw.trim())
    if (!m) throw new Error(`tokens.json: cannot read shadow layer "${raw.trim()}" in ${token}`)
    return { geometry: m[1], color: m[2] }
  })
}

function step(token: NamedToken): string {
  return token.name.replace(/^shadow-/, "")
}

function colorVar(token: NamedToken, layer: number): string {
  return `elevation-${step(token)}-${layer + 1}`
}

/** The per-theme colour declarations of one shadow token, as `[name, value]` pairs. */
export function shadowColors(token: NamedToken, theme: ThemeId): [string, string][] {
  return layers(valueIn(token, theme), token.name).map((l, i) => [colorVar(token, i), l.color])
}

/** The theme-independent `--shadow-*` value; throws if the themes disagree on geometry. */
export function shadowValue(token: NamedToken): string {
  const light = layers(valueIn(token, "light"), token.name)
  const dark = layers(valueIn(token, "dark"), token.name)
  const same = light.length === dark.length && light.every((l, i) => l.geometry === dark[i].geometry)
  if (!same) throw new Error(`tokens.json: ${token.name} must use the same geometry in both themes`)
  return light.map((l, i) => `${l.geometry} var(--${colorVar(token, i)})`).join(", ")
}
