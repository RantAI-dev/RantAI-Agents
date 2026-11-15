/**
 * Shape of `src/styles/tokens.json`, the design system's token export (Claude Design
 * "RantAI Agents"). Only the fields the generator reads are typed; `usage` notes are
 * documentation for people and are not rendered.
 */

export type ThemeId = "light" | "dark"

/** A literal value, a `{token}` alias, or one value per theme. */
export type TokenValue = string | Record<ThemeId, string>

export interface NamedToken {
  name: string
  value: TokenValue
  usage?: string
}

export interface TypeStyle {
  name: string
  fontSize: string
  lineHeight: string
  fontWeight: number
  letterSpacing?: string
  usage?: string
}

export interface DesignTokens {
  name: string
  version: number
  color: { themes: { id: ThemeId; name: string }[]; tokens: NamedToken[] }
  type: { groups: { name: string; family: "sans" | "mono"; styles: TypeStyle[] }[] }
  radius: { tokens: NamedToken[] }
  shadow: { tokens: NamedToken[] }
  duration: { tokens: NamedToken[] }
  easing: { tokens: NamedToken[] }
  size: { tokens: NamedToken[] }
  zIndex: { tokens: NamedToken[] }
}

const ALIAS = /^\{([a-z0-9-]+)\}$/

/** The token name a `{name}` alias points at, or null for a literal. */
export function aliasTarget(value: string): string | null {
  return ALIAS.exec(value)?.[1] ?? null
}

/** The value a token has in one theme, as written (literal or alias). */
export function valueIn(token: NamedToken, theme: ThemeId): string {
  return typeof token.value === "string" ? token.value : token.value[theme]
}
