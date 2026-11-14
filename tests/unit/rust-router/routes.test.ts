import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { matchRustRoute, RUST_ROUTES, rustRouting, rustTarget } from "@/lib/rust-router/routes"

const ALL = { RUST_API_URL: "http://rust:8090/", RUST_ROUTES: "assistants,sessions,memory,chat" }

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
