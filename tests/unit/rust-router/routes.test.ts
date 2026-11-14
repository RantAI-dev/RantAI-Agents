import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { matchRustRoute, RUST_ROUTES, rustRouting, rustTarget } from "@/lib/rust-router/routes"

const ALL = {
  RUST_API_URL: "http://rust:8090/",
  RUST_ROUTES: "assistants,sessions,memory,chat,auth,org,sso,sharing,agent-api",
}

describe("rustRouting", () => {
  it("routes nothing when RUST_API_URL is unset or blank", () => {
    expect(rustRouting({ RUST_ROUTES: "assistants,chat" })).toBeNull()
    expect(rustRouting({ RUST_API_URL: "  ", RUST_ROUTES: "assistants" })).toBeNull()
    expect(rustTarget("GET", "/api/assistants", "", { RUST_ROUTES: "assistants" })).toBeNull()
  })

  it("reads the groups, trims them and ignores unknown names", () => {
    const routing = rustRouting({ RUST_API_URL: "http://rust:8090/", RUST_ROUTES: " Assistants, bogus ,memory" })
    expect(routing?.baseUrl).toBe("http://rust:8090")
    expect([...(routing?.groups ?? [])].sort()).toEqual(["assistants", "memory"])
  })

  it("routes no group when RUST_ROUTES is empty", () => {
    expect(rustTarget("GET", "/api/assistants", "", { RUST_API_URL: "http://rust:8090" })).toBeNull()
  })
})

describe("rustTarget", () => {
  it("sends a routed path to Rust with its query string", () => {
    expect(rustTarget("GET", "/api/dashboard/chat/sessions", "?limit=5", ALL)?.url).toBe(
      "http://rust:8090/api/dashboard/chat/sessions?limit=5",
    )
    expect(rustTarget("post", "/api/assistants/wizard/stream", "", ALL)?.route.group).toBe("assistants")
  })

  it("keeps a group that is not turned on in Next", () => {
    const env = { RUST_API_URL: "http://rust:8090", RUST_ROUTES: "memory" }
    expect(rustTarget("GET", "/api/dashboard/memory", "", env)).not.toBeNull()
    expect(rustTarget("GET", "/api/assistants", "", env)).toBeNull()
  })

  it("keeps the session artifacts routes in Next", () => {
    expect(matchRustRoute("GET", "/api/dashboard/chat/sessions/s1/artifacts/a1")).toBeNull()
    expect(matchRustRoute("POST", "/api/dashboard/chat/sessions/s1/artifacts/a1/persist")).toBeNull()
    expect(matchRustRoute("GET", "/api/dashboard/chat/sessions/s1")?.group).toBe("sessions")
  })

  it("routes only the methods Rust registers", () => {
    expect(matchRustRoute("GET", "/api/dashboard/chat/sessions/s1/messages")).toBeNull()
    expect(matchRustRoute("DELETE", "/api/dashboard/chat/sessions/s1/messages")?.group).toBe("sessions")
    expect(matchRustRoute("GET", "/api/chat")).toBeNull()
    expect(matchRustRoute("POST", "/api/user/active-organization")).toBeNull()
  })

  it("leaves unported paths alone", () => {
    expect(matchRustRoute("POST", "/api/chat/upload")).toBeNull()
    expect(matchRustRoute("GET", "/api/dashboard/files")).toBeNull()
  })
})

describe("the sign-in group", () => {
  it("routes password sign-in, sign-out and the SSO flow", () => {
    expect(matchRustRoute("POST", "/api/auth/login")?.group).toBe("auth")
    expect(matchRustRoute("POST", "/api/auth/logout")?.group).toBe("auth")
    expect(matchRustRoute("GET", "/api/auth/sso/discover")?.group).toBe("auth")
    expect(matchRustRoute("GET", "/api/auth/sso/keycloak/start")?.group).toBe("auth")
    expect(matchRustRoute("GET", "/api/auth/sso/keycloak/callback")?.group).toBe("auth")
    expect(matchRustRoute("POST", "/api/mobile/login")?.group).toBe("auth")
  })

  it("never takes over the NextAuth routes the pages still call", () => {
    expect(matchRustRoute("GET", "/api/auth/session")).toBeNull()
    expect(matchRustRoute("POST", "/api/auth/session")).toBeNull()
    expect(matchRustRoute("GET", "/api/auth/csrf")).toBeNull()
    expect(matchRustRoute("POST", "/api/auth/callback/credentials")).toBeNull()
    expect(matchRustRoute("GET", "/api/auth/providers")).toBeNull()
  })

  it("routes only the methods Rust registers", () => {
    expect(matchRustRoute("GET", "/api/auth/login")).toBeNull()
    expect(matchRustRoute("POST", "/api/auth/sso/discover")).toBeNull()
  })
})

describe("the organisation group", () => {
  it("routes the organisation, its members, units and audit log", () => {
    expect(matchRustRoute("GET", "/api/organizations")?.group).toBe("org")
    expect(matchRustRoute("PATCH", "/api/organizations/o1")?.group).toBe("org")
    expect(matchRustRoute("POST", "/api/organizations/o1/members")?.group).toBe("org")
    expect(matchRustRoute("POST", "/api/organizations/o1/members/accept")?.group).toBe("org")
    expect(matchRustRoute("DELETE", "/api/organizations/o1/members/m1")?.group).toBe("org")
    expect(matchRustRoute("POST", "/api/organizations/o1/units")?.group).toBe("org")
    expect(matchRustRoute("PATCH", "/api/organizations/o1/units/u1")?.group).toBe("org")
    expect(matchRustRoute("GET", "/api/organizations/o1/units/u1/members")?.group).toBe("org")
    expect(matchRustRoute("DELETE", "/api/organizations/o1/units/u1/members")?.group).toBe("org")
    expect(matchRustRoute("GET", "/api/organizations/o1/audit")?.group).toBe("org")
  })

  it("keeps a route Rust does not serve in Next", () => {
    expect(matchRustRoute("PUT", "/api/organizations/o1")).toBeNull()
    expect(matchRustRoute("DELETE", "/api/organizations/o1")).toBeNull()
    expect(matchRustRoute("GET", "/api/organizations/o1/logo")).toBeNull()
  })
})

describe("the identity-provider group", () => {
  it("routes the provider admin API", () => {
    expect(matchRustRoute("GET", "/api/dashboard/sso/providers")?.group).toBe("sso")
    expect(matchRustRoute("POST", "/api/dashboard/sso/providers")?.group).toBe("sso")
    expect(matchRustRoute("GET", "/api/dashboard/sso/providers/p1")?.group).toBe("sso")
    expect(matchRustRoute("PATCH", "/api/dashboard/sso/providers/p1")?.group).toBe("sso")
    expect(matchRustRoute("DELETE", "/api/dashboard/sso/providers/p1")?.group).toBe("sso")
    expect(matchRustRoute("POST", "/api/dashboard/sso/providers/p1/test")?.group).toBe("sso")
    expect(matchRustRoute("PUT", "/api/dashboard/sso/providers/p1")).toBeNull()
  })
})

describe("the sharing group", () => {
  it("routes the shares on a chat and the chats shared with the caller", () => {
    expect(matchRustRoute("GET", "/api/dashboard/chat/sessions/s1/shares")?.group).toBe("sharing")
    expect(matchRustRoute("PUT", "/api/dashboard/chat/sessions/s1/shares")?.group).toBe("sharing")
    expect(matchRustRoute("DELETE", "/api/dashboard/chat/sessions/s1/shares/x1")?.group).toBe(
      "sharing",
    )
    expect(matchRustRoute("GET", "/api/dashboard/chat/shared")?.group).toBe("sharing")
    expect(matchRustRoute("GET", "/api/dashboard/chat/shared/s1")?.group).toBe("sharing")
    expect(matchRustRoute("POST", "/api/dashboard/chat/shared/s1/fork")?.group).toBe("sharing")
    // The session routes stay owner-only: sharing never widens them.
    expect(matchRustRoute("PATCH", "/api/dashboard/chat/sessions/s1/shares")).toBeNull()
  })
})

describe("the agent-api group", () => {
  it("routes the key admin API and the agent HTTP surface", () => {
    expect(matchRustRoute("GET", "/api/dashboard/agent-api-keys")?.group).toBe("agent-api")
    expect(matchRustRoute("POST", "/api/dashboard/agent-api-keys")?.group).toBe("agent-api")
    expect(matchRustRoute("PUT", "/api/dashboard/agent-api-keys/k1")?.group).toBe("agent-api")
    expect(matchRustRoute("DELETE", "/api/dashboard/agent-api-keys/k1")?.group).toBe("agent-api")
    expect(matchRustRoute("PATCH", "/api/dashboard/agent-api-keys/k1")?.group).toBe("agent-api")
    expect(matchRustRoute("POST", "/v1/chat/completions")?.group).toBe("agent-api")
    expect(matchRustRoute("OPTIONS", "/v1/chat/completions")?.group).toBe("agent-api")
  })

  it("leaves the socket to the proxy in front: fetch cannot forward an Upgrade", () => {
    expect(matchRustRoute("GET", "/v1/agents/a1/ws")).toBeNull()
  })
})

describe("the access panel", () => {
  it("routes an agent's grants with the assistants group", () => {
    expect(matchRustRoute("GET", "/api/assistants/a1/access")?.group).toBe("assistants")
    expect(matchRustRoute("PUT", "/api/assistants/a1/access")?.group).toBe("assistants")
    expect(matchRustRoute("DELETE", "/api/assistants/a1/access/g1")?.group).toBe("assistants")
  })
})

describe("the table against the Rust router", () => {
  // Every path agents-server registers is in the table, or named here with the reason.
  const NOT_ROUTED: Record<string, string> = {
    "/healthz": "the probe is called on agents-server itself",
    "/readyz": "the probe is called on agents-server itself",
    "/v1/agents/{}/ws": "a WebSocket: the proxy in front sends it to agents-server",
  }
  const routesDir = path.resolve(__dirname, "../../../rust/crates/agents-server/src/routes")
  const sources = readdirSync(routesDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".rs"))
    .map((file) => readFileSync(path.join(routesDir, file), "utf8"))
  const registered = new Set(
    sources.flatMap((source) =>
      [...source.matchAll(/\.route\(\s*"(\/[^"]+)"/g)].map((m) => m[1].replace(/\{[^}]+\}/g, "{}")),
    ),
  )
  const table = new Set(RUST_ROUTES.map((r) => r.path.replace(/\{[^}]+\}/g, "{}")))

  it("finds the routes it checks", () => {
    expect(registered.size).toBeGreaterThan(40)
  })

  it.each([...registered].filter((p) => !(p in NOT_ROUTED)).map((p) => [p]))(
    "routes %s",
    (registeredPath) => {
      expect(table.has(registeredPath)).toBe(true)
    },
  )

  it("names nothing Rust does not serve", () => {
    expect([...table].filter((p) => !registered.has(p))).toEqual([])
  })
})

describe("a group that is off", () => {
  it("keeps every new surface in Next until it is named in RUST_ROUTES", () => {
    const env = { RUST_API_URL: "http://rust:8090", RUST_ROUTES: "assistants" }
    expect(rustTarget("POST", "/api/auth/login", "", env)).toBeNull()
    expect(rustTarget("GET", "/api/organizations", "", env)).toBeNull()
    expect(rustTarget("GET", "/api/dashboard/sso/providers", "", env)).toBeNull()
    expect(rustTarget("GET", "/api/dashboard/chat/shared", "", env)).toBeNull()
    expect(rustTarget("POST", "/v1/chat/completions", "", env)).toBeNull()
    expect(rustTarget("GET", "/api/assistants", "", env)).not.toBeNull()
  })
})

describe("the middleware matcher", () => {
  // Next only runs the middleware for matched paths: a route in the table that the matcher
  // misses would silently stay in Next.
  const source = readFileSync(path.resolve(__dirname, "../../../src/middleware.ts"), "utf8")
  const matcher = [...source.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1])
  const compiled = matcher.map(
    (entry) => new RegExp(`^${entry.replace(/\/:path\*$/, "(/.*)?")}$`),
  )

  it.each(RUST_ROUTES.filter((r) => !r.viaRouteHandler).map((r) => [r.path]))(
    "covers %s",
    (routePath) => {
      const concrete = routePath.replace(/\{[^}]+\}/g, "x1")
      expect(compiled.some((re) => re.test(concrete))).toBe(true)
    },
  )
})
