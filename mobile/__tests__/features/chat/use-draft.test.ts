import { describe, it, expect, beforeEach } from "vitest"

// Tests the underlying MMKV storage contract that useDraft uses, without
// rendering the React hook (RTL needs an RN runtime not available in the
// node-env vitest config). Hook integration is exercised by Maestro E2E.

beforeEach(async () => {
  const { storage } = await import("@/lib/mmkv")
  storage.delete("draft/conversation/c1")
  storage.delete("draft/conversation/c2")
})

describe("useDraft storage contract", () => {
  it("persists distinct drafts per conversation id", async () => {
    const { storage } = await import("@/lib/mmkv")
    storage.set("draft/conversation/c1", "hello")
    storage.set("draft/conversation/c2", "world")
    expect(storage.getString("draft/conversation/c1")).toBe("hello")
    expect(storage.getString("draft/conversation/c2")).toBe("world")
  })

  it("delete removes the stored draft", async () => {
    const { storage } = await import("@/lib/mmkv")
    storage.set("draft/conversation/c1", "draft")
    expect(storage.getString("draft/conversation/c1")).toBe("draft")
    storage.delete("draft/conversation/c1")
    expect(storage.getString("draft/conversation/c1")).toBeUndefined()
  })
})
