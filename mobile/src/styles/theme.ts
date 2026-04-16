import { tokens } from "./tokens"

export type Theme = {
  scheme: "light" | "dark"
  colors: {
    background: string
    foreground: string
    primary: string
    muted: string
    border: string
    danger: string
  }
  radii: typeof tokens.radii
  spacing: typeof tokens.spacing
  fontSizes: typeof tokens.fontSizes
}

const pick = (scheme: "light" | "dark") => ({
  background: tokens.colors.background[scheme],
  foreground: tokens.colors.foreground[scheme],
  primary: tokens.colors.primary[scheme],
  muted: tokens.colors.muted[scheme],
  border: tokens.colors.border[scheme],
  danger: tokens.colors.danger[scheme],
})

export const lightTheme: Theme = {
  scheme: "light",
  colors: pick("light"),
  radii: tokens.radii,
  spacing: tokens.spacing,
  fontSizes: tokens.fontSizes,
}
export const darkTheme: Theme = {
  scheme: "dark",
  colors: pick("dark"),
  radii: tokens.radii,
  spacing: tokens.spacing,
  fontSizes: tokens.fontSizes,
}
