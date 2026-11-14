import { rustRouting, type RoutingEnv } from "./routes"

export interface RustHealth {
  /** `RUST_API_URL` is set. */
  configured: boolean
  /** The groups `RUST_ROUTES` turns on. */
  routes: string[]
  /** Rust's `/readyz` answered 2xx in time; `null` when not configured. */
  ready: boolean | null
}

const READY_TIMEOUT_MS = 2000

export async function rustHealth(
  env?: RoutingEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<RustHealth> {
  const routing = rustRouting(env)
  if (!routing) return { configured: false, routes: [], ready: null }
  const routes = [...routing.groups].sort()
  try {
    const response = await fetchImpl(`${routing.baseUrl}/readyz`, {
      signal: AbortSignal.timeout(READY_TIMEOUT_MS),
    })
    await response.body?.cancel()
    return { configured: true, routes, ready: response.ok }
  } catch {
    return { configured: true, routes, ready: false }
  }
}
