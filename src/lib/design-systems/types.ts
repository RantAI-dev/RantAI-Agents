/**
 * A portable design system — the brand "contract" that steers how generated
 * visual artifacts (HTML, React, SVG, slides, 3D) look. Modeled after the
 * open-design / Claude-Design `DESIGN.md` format: authoritative prose + a
 * verbatim CSS token block + Tailwind usage guidance + a component inventory.
 *
 * Today exactly one system ships (`rantai`, the house style) and it is always
 * the default. The shape is deliberately multi-system so a future "Design"
 * surface can add a picker over a catalog without touching the engine.
 */
export interface DesignSystem {
  /** Stable id used in chatConfig / request bodies (e.g. "rantai"). */
  id: string
  /** Human label for a future picker. */
  title: string
  /** One-line description for catalog UIs. */
  summary: string
  /** Loose grouping for a future catalog (e.g. "Brand", "Editorial"). */
  category?: string
  /** When true this system is the fallback used when no id is supplied. */
  isDefault?: boolean
  /**
   * Authoritative prose (DESIGN.md style): visual theme, palette roles,
   * typography, spacing, depth, motion, voice, anti-patterns. Written WITHOUT
   * markdown code fences — the prompt builder adds any fencing it needs.
   */
  designMd: string
  /**
   * A `:root { … }` (plus dark-mode) CSS custom-property contract. The model is
   * told to paste this VERBATIM into the artifact's first `<style>`, then build
   * with the variables. This is the single biggest lever for brand-grade,
   * consistent output. No backticks.
   */
  tokensCss: string
  /**
   * How to apply the tokens with the Tailwind v3 (CDN) utilities the HTML/React
   * artifact runtimes load — arbitrary-value classes like `bg-[var(--ds-bg)]`.
   * No backticks.
   */
  tailwindGuide: string
  /** Compact component inventory the model mirrors for consistency. No backticks. */
  componentManifest: string
}
