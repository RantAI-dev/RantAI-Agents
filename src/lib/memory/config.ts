/**
 * Memory System Configuration
 *
 * Centralized configuration for memory system behavior,
 * including feature flags for Mastra integration.
 */

/**
 * Memory system feature flags
 */
export const MEMORY_CONFIG = {
  /**
   * Enable Mastra Memory API for semantic recall.
   * When true, uses Mastra-style recall path (currently backed by existing SurrealDB semantic search).
   * Set MASTRA_MEMORY_ENABLED=true to enable.
   */
  useMastraMemory: process.env.MASTRA_MEMORY_ENABLED === 'true',

  /**
   * Enable graceful degradation on Mastra errors.
   * When true, falls back to existing memory system on errors.
   * When false, propagates Mastra errors to caller.
   */
  gracefulDegradation: process.env.MASTRA_GRACEFUL_DEGRADATION !== 'false',

  /**
   * Enable dual-write to both Mastra and existing systems.
   * Useful during migration. Warning: increases write latency.
   */
  dualWrite: process.env.MASTRA_DUAL_WRITE === 'true',

  /**
   * Log Mastra Memory operations for debugging.
   */
  debug: process.env.MASTRA_DEBUG === 'true',
} as const;

/**
 * Get current memory configuration as string (for logging)
 */
export function getMemoryConfigSummary(): string {
  return JSON.stringify(
    {
      useMastraMemory: MEMORY_CONFIG.useMastraMemory,
      gracefulDegradation: MEMORY_CONFIG.gracefulDegradation,
      dualWrite: MEMORY_CONFIG.dualWrite,
      debug: MEMORY_CONFIG.debug,
    },
    null,
    2
  );
}
