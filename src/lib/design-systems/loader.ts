import type { DesignSystem } from "./types"
import { DESIGN_SYSTEMS, DEFAULT_DESIGN_SYSTEM_ID } from "./registry"

export type { DesignSystem } from "./types"
export { DEFAULT_DESIGN_SYSTEM_ID } from "./registry"

/** Lightweight metadata for catalogs / a future picker (no big strings). */
export interface DesignSystemSummary {
  id: string
  title: string
  summary: string
  category?: string
  isDefault?: boolean
}

/**
 * Resolve a design system by id, falling back to the default when the id is
 * missing or unknown. Always returns a system — callers never have to null-check.
 */
export function loadDesignSystem(id?: string | null): DesignSystem {
  if (id && DESIGN_SYSTEMS[id]) return DESIGN_SYSTEMS[id]
  return DESIGN_SYSTEMS[DEFAULT_DESIGN_SYSTEM_ID]
}

/** True when `id` names a registered system. */
export function isKnownDesignSystem(id?: string | null): boolean {
  return !!id && id in DESIGN_SYSTEMS
}

/** All systems as catalog metadata, default first. */
export function listDesignSystems(): DesignSystemSummary[] {
  return Object.values(DESIGN_SYSTEMS)
    .map(({ id, title, summary, category, isDefault }) => ({
      id,
      title,
      summary,
      category,
      isDefault,
    }))
    .sort((a, b) => Number(b.isDefault ?? false) - Number(a.isDefault ?? false))
}
