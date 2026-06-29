/**
 * Builds the design-system context injected into the system prompt before the
 * model emits a visual artifact (HTML, React, SVG, slides, 3D).
 *
 * The block adopts the open-design / Claude-Design pattern: an authoritative
 * prose contract + a CSS token block the model pastes VERBATIM + Tailwind usage
 * guidance + a component inventory. The active system defaults to the RantAI
 * house style; a `designSystemId` can select another (for a future picker).
 */

import { loadDesignSystem } from "@/lib/design-systems/loader"

/**
 * Artifact types the design system steers. Scoped to the two Tailwind-v3 (CDN)
 * runtimes whose palettes are otherwise unconstrained — SVG (its renderer
 * rejects <style>), slides (their own enforced theme palette), and 3D (no DOM)
 * are intentionally excluded so the token contract never fights a validator.
 */
const STYLED_ARTIFACT_TYPES = new Set(["text/html", "application/react"])

const AUTHORITY_NOTE = `This is the authoritative brand style for the artifact you produce — apply it by default. The ONLY exception: if the user explicitly asks for a different aesthetic, theme, or brand (e.g. "make it brutalist", "dark neon look", "match our pink brand"), honor that request and treat this system as the fallback. Otherwise do not invent colors, fonts, radii, or shadows outside it.`

const TOKENS_NOTE = `These CSS variables are ALREADY injected into the artifact runtime — build with them directly (e.g. bg-[var(--ds-bg)], text-[var(--ds-ink)]). The block below is for reference (names + values); you do not need to paste it.`

/**
 * Returns the design-system block for an artifact type.
 *
 * @param type           the artifact type, or null when the type isn't known
 *                       yet (auto canvas / opt-in artifact creation)
 * @param designSystemId selects the system; defaults to the house style
 * @param depth          "full" (type-targeted, with prose + manifest) or
 *                       "compact" (lighter, for auto/opt-in modes). Defaults to
 *                       "full" when a concrete type is given, else "compact".
 */
export function getDesignSystemContext(
  type: string | null,
  designSystemId?: string,
  depth: "full" | "compact" = type ? "full" : "compact",
): string {
  // Only the Tailwind-based HTML/React runtimes get the token contract. Other
  // types (code, markdown, slides, svg, 3d, …) skip it — see STYLED_ARTIFACT_TYPES.
  if (type && !STYLED_ARTIFACT_TYPES.has(type)) return ""

  const system = loadDesignSystem(designSystemId)

  const parts: string[] = []
  parts.push(`## Active design system — ${system.title} (house default)\n${AUTHORITY_NOTE}`)

  if (depth === "full") {
    parts.push(system.designMd)
  } else {
    parts.push(
      `Brand essence: ${system.summary}\nApply it to any HTML or React artifact you create.`,
    )
  }

  parts.push(
    `## Design tokens (already loaded — use these variables)\n${TOKENS_NOTE}\n\n\`\`\`css\n${system.tokensCss}\n\`\`\``,
  )

  parts.push(`## Applying the tokens (Tailwind v3)\n${system.tailwindGuide}`)
  if (depth === "full") {
    parts.push(`## Component reference\n${system.componentManifest}`)
  }

  return parts.join("\n\n")
}
