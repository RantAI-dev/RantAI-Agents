// Source of truth for design tokens. Mirrors web Tailwind palette so brand
// stays identical across platforms.
export const tokens = {
  colors: {
    background: { light: "#ffffff", dark: "#0b0b0d" },
    foreground: { light: "#0b0b0d", dark: "#fafafa" },
    primary: { light: "#1d4ed8", dark: "#60a5fa" },
    muted: { light: "#f4f4f5", dark: "#1f1f23" },
    border: { light: "#e4e4e7", dark: "#27272a" },
    danger: { light: "#dc2626", dark: "#ef4444" },
  },
  radii: { sm: 4, md: 8, lg: 12, xl: 16, "2xl": 20 },
  spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 },
  fontSizes: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30 },
} as const
