import { describe, it, expect } from "vitest"
import { LruCache } from "@/lib/rag/lru-cache"

describe("LruCache", () => {
  it("stores and retrieves", () => {
    const c = new LruCache<string, number>({ maxSize: 3 })
    c.set("a", 1); c.set("b", 2)
    expect(c.get("a")).toBe(1); expect(c.get("b")).toBe(2); expect(c.get("missing")).toBeUndefined()
  })

  it("evicts least-recently-used when over capacity", () => {
    const c = new LruCache<string, number>({ maxSize: 2 })
    c.set("a", 1); c.set("b", 2); c.set("c", 3)
    expect(c.get("a")).toBeUndefined()  // evicted
    expect(c.get("b")).toBe(2); expect(c.get("c")).toBe(3)
  })

  it("get promotes to most-recent", () => {
    const c = new LruCache<string, number>({ maxSize: 2 })
    c.set("a", 1); c.set("b", 2); c.get("a"); c.set("c", 3)
    expect(c.get("a")).toBe(1); expect(c.get("b")).toBeUndefined()
  })

  it("respects ttl when set", async () => {
    const c = new LruCache<string, number>({ maxSize: 10, ttlMs: 20 })
    c.set("a", 1)
    expect(c.get("a")).toBe(1)
    await new Promise((r) => setTimeout(r, 30))
    expect(c.get("a")).toBeUndefined()
  })
})
