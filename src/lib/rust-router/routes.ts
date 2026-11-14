/**
 * Which API requests the Rust server (`rust/crates/agents-server`) answers.
 *
 * `RUST_API_URL` unset: nothing is routed. `RUST_ROUTES` names the groups that are, so each
 * surface is cut over, and rolled back, on its own (docs/operations/rust-cutover.md).
 *
 * The table is exactly what `rust/crates/agents-server/src/routes/**` registers, path and
 * method. A path Rust serves with fewer methods than Next keeps the rest in Next.
 */

export const ROUTE_GROUPS = ["assistants", "sessions", "memory", "chat"] as const
export type RouteGroup = (typeof ROUTE_GROUPS)[number]

export interface RustRoute {
  group: RouteGroup
  /** The path as axum writes it; `{id}` is one segment. */
  path: string
  methods: readonly string[]
  /**
   * Served by a Next route that forwards and falls back (`/api/chat`, the tool approval),
   * so the middleware leaves it alone.
   */
  viaRouteHandler?: boolean
}

const CRUD = ["GET", "PUT", "PATCH", "DELETE"] as const
const GET_PUT = ["GET", "PUT"] as const

export const RUST_ROUTES: readonly RustRoute[] = [
  // routes/assistants/mod.rs
  { group: "assistants", path: "/api/assistants", methods: ["GET", "POST"] },
  { group: "assistants", path: "/api/assistants/wizard/stream", methods: ["POST"] },
  { group: "assistants", path: "/api/assistants/{id}", methods: CRUD },
  { group: "assistants", path: "/api/assistants/{id}/tools", methods: GET_PUT },
  { group: "assistants", path: "/api/assistants/{id}/skills", methods: GET_PUT },
  { group: "assistants", path: "/api/assistants/{id}/mcp-servers", methods: GET_PUT },
  { group: "assistants", path: "/api/assistants/{id}/workflows", methods: GET_PUT },
  { group: "assistants", path: "/api/assistants/{id}/default", methods: ["POST", "DELETE"] },
  { group: "assistants", path: "/api/user/default-assistant", methods: GET_PUT },
  { group: "assistants", path: "/api/user/preferences", methods: ["GET", "PUT", "PATCH"] },
  { group: "assistants", path: "/api/mobile/assistants", methods: ["GET", "POST"] },
  { group: "assistants", path: "/api/mobile/assistants/{id}", methods: CRUD },
  { group: "assistants", path: "/api/mobile/assistants/{id}/tools", methods: GET_PUT },
  { group: "assistants", path: "/api/mobile/assistants/{id}/skills", methods: GET_PUT },
  { group: "assistants", path: "/api/mobile/assistants/{id}/duplicate", methods: ["POST"] },
  { group: "assistants", path: "/api/mobile/assistants/{id}/default", methods: ["POST"] },
  // routes/sessions.rs — the artifacts sub-routes are not ported and stay in Next.
  { group: "sessions", path: "/api/dashboard/chat/sessions", methods: ["GET", "POST"] },
  { group: "sessions", path: "/api/dashboard/chat/sessions/{id}", methods: ["GET", "PATCH", "DELETE"] },
  {
    group: "sessions",
    path: "/api/dashboard/chat/sessions/{id}/messages",
    methods: ["POST", "PATCH", "DELETE"],
  },
  // routes/memory.rs
  { group: "memory", path: "/api/dashboard/memory", methods: ["GET", "DELETE"] },
  { group: "memory", path: "/api/dashboard/memory/{id}", methods: ["DELETE"] },
  { group: "memory", path: "/api/mobile/memories", methods: ["GET", "DELETE"] },
  { group: "memory", path: "/api/mobile/memories/{id}", methods: ["DELETE"] },
  // routes/chat/mod.rs, routes/chat/approval.rs
  { group: "chat", path: "/api/chat", methods: ["POST"], viaRouteHandler: true },
  { group: "chat", path: "/api/chat/tool-approval", methods: ["POST"], viaRouteHandler: true },
]

const COMPILED = RUST_ROUTES.map((route) => ({
  route,
  pattern: new RegExp(`^${route.path.replace(/\{[^}]+\}/g, "[^/]+")}/?$`),
}))

export interface RustRouting {
  baseUrl: string
  groups: ReadonlySet<RouteGroup>
}

export interface RoutingEnv {
  RUST_API_URL?: string
  RUST_ROUTES?: string
}

/**
 * The literal `process.env.X` reads matter: the edge middleware only receives the variables
 * the build sees referenced by name, at runtime.
 */
function processEnv(): RoutingEnv {
  return { RUST_API_URL: process.env.RUST_API_URL, RUST_ROUTES: process.env.RUST_ROUTES }
}

/** The routing in force, or `null` when nothing goes to Rust. Unknown group names are ignored. */
export function rustRouting(env: RoutingEnv = processEnv()): RustRouting | null {
  const baseUrl = env.RUST_API_URL?.trim().replace(/\/+$/, "")
  if (!baseUrl) return null
  const known = new Set<string>(ROUTE_GROUPS)
  const groups = new Set(
    (env.RUST_ROUTES ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name): name is RouteGroup => known.has(name)),
  )
  return { baseUrl, groups }
}

export function matchRustRoute(method: string, pathname: string): RustRoute | null {
  const upper = method.toUpperCase()
  for (const { route, pattern } of COMPILED) {
    if (pattern.test(pathname) && route.methods.includes(upper)) return route
  }
  return null
}

/**
 * The Rust URL for this request, or `null` when Next answers it.
 * `search` is the query string with its leading `?`, or empty.
 */
export function rustTarget(
  method: string,
  pathname: string,
  search = "",
  env: RoutingEnv = processEnv(),
): { url: string; route: RustRoute } | null {
  const routing = rustRouting(env)
  if (!routing) return null
  const route = matchRustRoute(method, pathname)
  if (!route || !routing.groups.has(route.group)) return null
  return { url: `${routing.baseUrl}${pathname}${search}`, route }
}
