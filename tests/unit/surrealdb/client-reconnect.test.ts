/**
 * The SurrealDB client must recover from a server restart on its own.
 *
 * Reproduced against a real SurrealDB v2 (scripts/check-surreal-restart.ts)
 * before this file was written: after `docker restart`, the SDK still reports
 * `status: "connected"`, emits no event, and every call on the old socket —
 * `query`, `signin`, even `close` — returns a promise that never settles. No
 * error means no catch block runs, so the existing reconnect logic was
 * unreachable. In production that was a chat API that hung for twelve days
 * while its health check returned 200.
 *
 * The fake below models exactly that: a socket that, once "killed", answers
 * nothing. A new instance (what a real reconnect creates) works.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type Fake = { dead: boolean; calls: string[] }
const instances: Fake[] = []
const never = () => new Promise<never>(() => {})

vi.mock("surrealdb", () => ({
  default: class {
    state: Fake = { dead: false, calls: [] }
    constructor() { instances.push(this.state) }
    private run<T>(name: string, value: T): Promise<T> {
      this.state.calls.push(name)
      return this.state.dead ? never() : Promise.resolve(value)
    }
    connect() { return this.run("connect", undefined) }
    signin() { return this.run("signin", "token") }
    use() { return this.run("use", undefined) }
    close() { return this.run("close", undefined) }
    query(sql: string) { return this.run(`query:${sql}`, [[{ ok: sql }]]) }
    create() { return this.run("create", { id: "x" }) }
    delete() { return this.run("delete", undefined) }
  },
}))

const cfg = { url: "ws://x/rpc", username: "root", password: "root", namespace: "n", database: "d" }
const ENV = { SURREAL_QUERY_TIMEOUT_MS: "200", SURREAL_CONNECT_TIMEOUT_MS: "200", SURREAL_PING_TIMEOUT_MS: "50", SURREAL_IDLE_PING_MS: "100000" }

async function freshClient() {
  vi.resetModules()
  instances.length = 0
  const { SurrealDBClient } = await import("@/lib/surrealdb/client")
  return SurrealDBClient.getInstance(cfg)
}

beforeEach(() => { Object.assign(process.env, ENV); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}) })
afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; vi.restoreAllMocks() })

describe("SurrealDB client after the server restarts", () => {
  it("answers a read on a fresh connection instead of hanging", async () => {
    const client = await freshClient()
    expect(await client.query("SELECT 1;")).toEqual([{ result: [{ ok: "SELECT 1;" }] }])

    instances[0].dead = true // the restart: the old socket goes silent
    const result = await client.query("SELECT 2;")

    expect(result).toEqual([{ result: [{ ok: "SELECT 2;" }] }])
    expect(instances.length, "a new connection must have been opened").toBe(2)
    expect(instances[1].calls).toEqual(["connect", "signin", "use", "query:SELECT 2;"])
  })

  it("does not wait for the dead socket to close before reconnecting", async () => {
    const client = await freshClient()
    instances[0].dead = true
    const t0 = Date.now()
    await client.query("SELECT 1;")
    // One query timeout (200 ms) plus slack — not that plus a hung close().
    expect(Date.now() - t0).toBeLessThan(1500)
  })

  it("recovers when the stale-auth refresh is what hangs", async () => {
    const client = await freshClient()
    ;(client as unknown as { lastAuthTime: number }).lastAuthTime = 1 // > 50 min old
    instances[0].dead = true
    expect(await client.query("SELECT 1;")).toEqual([{ result: [{ ok: "SELECT 1;" }] }])
    expect(instances.length).toBe(2)
  })

  it("keeps working afterwards without reconnecting again", async () => {
    const client = await freshClient()
    instances[0].dead = true
    await client.query("SELECT 1;")
    await client.query("SELECT 2;")
    await client.query("SELECT 3;")
    expect(instances.length).toBe(2)
  })

  it("does not silently re-run a write that timed out, but leaves the connection usable", async () => {
    // A timed-out write may or may not have reached the server. Running it a
    // second time could store a chunk twice, so the caller is told instead.
    const client = await freshClient()
    instances[0].dead = true
    await expect(client.query("DELETE document_chunk WHERE document_id = $d;")).rejects.toThrow(/timed out/i)
    expect(instances.length, "the connection is still replaced").toBe(2)
    expect(instances[1].calls.filter((c) => c.startsWith("query:DELETE"))).toEqual([])
    // The next call goes through on the new connection.
    expect(await client.query("SELECT 1;")).toEqual([{ result: [{ ok: "SELECT 1;" }] }])
  })

  it("detects a dead connection with a quick ping after an idle period", async () => {
    process.env.SURREAL_IDLE_PING_MS = "0" // every call is "after idle"
    process.env.SURREAL_QUERY_TIMEOUT_MS = "60000" // must NOT be what saves us
    const client = await freshClient()
    instances[0].dead = true
    const t0 = Date.now()
    expect(await client.query("SELECT 1;")).toEqual([{ result: [{ ok: "SELECT 1;" }] }])
    expect(Date.now() - t0, "recovery should cost the ping timeout, not the query timeout").toBeLessThan(1500)
  })

  it("reports unhealthy, not hung, while the server is still down", async () => {
    const client = await freshClient()
    instances[0].dead = true
    // Every new connection is dead too: the server has not come back yet.
    const { default: Surreal } = await import("surrealdb")
    const orig = (Surreal as unknown as { prototype: { connect: () => Promise<void> } }).prototype.connect
    ;(Surreal as unknown as { prototype: { connect: () => Promise<void> } }).prototype.connect = () => never()
    try {
      const t0 = Date.now()
      expect(await client.healthCheck()).toBe(false)
      expect(Date.now() - t0).toBeLessThan(2000)
    } finally {
      ;(Surreal as unknown as { prototype: { connect: () => Promise<void> } }).prototype.connect = orig
    }
    // And it recovers once the server is back.
    expect(await client.healthCheck()).toBe(true)
  })
})
