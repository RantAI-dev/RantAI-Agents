import { aliasTarget, valueIn, type DesignTokens, type ThemeId } from "./schema"

/** A colour token's final `#rrggbb` value in one theme, following `{alias}` chains. */
export function resolveColor(tokens: DesignTokens, name: string, theme: ThemeId): string {
  const seen = new Set<string>()
  let current = name
  for (;;) {
    if (seen.has(current)) throw new Error(`alias cycle at ${current}`)
    seen.add(current)
    const token = tokens.color.tokens.find((t) => t.name === current)
    if (!token) throw new Error(`unknown colour token ${current}`)
    const raw = valueIn(token, theme)
    const target = aliasTarget(raw)
    if (!target) return raw
    current = target
  }
}
