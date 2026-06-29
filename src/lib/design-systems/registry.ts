import type { DesignSystem } from "./types"
import { rantaiDesignSystem } from "./rantai"

/**
 * Single source of truth for available design systems. Today this is just the
 * RantAI house style; a future "Design" surface can register more entries here
 * (or load them from disk/DB) without changing any consumer.
 */
export const DESIGN_SYSTEMS: Record<string, DesignSystem> = {
  [rantaiDesignSystem.id]: rantaiDesignSystem,
}

/** The system used when a request/agent doesn't specify one. */
export const DEFAULT_DESIGN_SYSTEM_ID = "rantai"
