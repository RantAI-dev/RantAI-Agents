import type { KbRuntime } from "./ports"

/**
 * The KB runtime registry.
 *
 * The engine calls `kb("blob")`, `kb("jobs")`, … instead of importing app
 * infrastructure, and imports ONLY this file and ./ports — never ./index or
 * ./adapters, so it pulls in no infra even transitively. The app wires real
 * adapters by importing "@/lib/kb-runtime" (see ./index); tests register fakes.
 *
 * A port that was never registered throws a named error at first use rather
 * than failing as a null-deref three frames deeper.
 */

// Held on globalThis, not in a module-level `let`, for the same reason
// lib/prisma does it: Next.js can instantiate the same module more than once
// across bundles/route graphs, and vitest's `vi.resetModules()` drops module
// state outright. Either would silently hand back an unconfigured registry.
const globalForKb = globalThis as unknown as { __kbRuntime?: Partial<KbRuntime> }
globalForKb.__kbRuntime ??= {}

/** Register adapters. Merges, so partial overrides in tests are fine. */
export function configureKb(runtime: Partial<KbRuntime>): void {
  globalForKb.__kbRuntime = { ...globalForKb.__kbRuntime, ...runtime }
}

export function kb<K extends keyof KbRuntime>(port: K): KbRuntime[K] {
  const value = globalForKb.__kbRuntime?.[port]
  if (!value) {
    throw new Error(
      `[kb-runtime] port "${String(port)}" is not configured — ` +
        `the app must import "@/lib/kb-runtime" (which registers the adapters) ` +
        `before using the KB engine`
    )
  }
  return value as KbRuntime[K]
}

/** True when a port is available without throwing. */
export function hasKbPort(port: keyof KbRuntime): boolean {
  return Boolean(globalForKb.__kbRuntime?.[port])
}

/** Test seam — drops all registered adapters. */
export function resetKbRuntime(): void {
  globalForKb.__kbRuntime = {}
}
