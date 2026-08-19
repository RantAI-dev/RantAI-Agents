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

let current: Partial<KbRuntime> = {}

/** Register adapters. Merges, so partial overrides in tests are fine. */
export function configureKb(runtime: Partial<KbRuntime>): void {
  current = { ...current, ...runtime }
}

export function kb<K extends keyof KbRuntime>(port: K): KbRuntime[K] {
  const value = current[port]
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
  return Boolean(current[port])
}

/** Test seam — drops all registered adapters. */
export function resetKbRuntime(): void {
  current = {}
}
