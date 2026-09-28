/**
 * saveMemory / forgetMemory tool behaviour + working-memory cache bounds.
 * Tools must write at call time and report the truth (QA CHAT-021/022).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }))

vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("./fake-user-memory-db")).fakeDb.prisma,
}))
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: generateTextMock,
}))
vi.mock("@/lib/llm/provider", () => ({
  getChatProvider: () => () => ({}),
  resolveModelId: (id: string) => id,
}))

import { fakeDb } from "./fake-user-memory-db"
import {
  executeSaveMemory,
  executeForgetMemory,
  createMemoryTools,
  type MemoryToolContext,
  type MemoryToolState,
} from "@/lib/memory/memory-tools"
import { loadUserProfile, formatUserProfileForPrompt } from "@/lib/memory/long-term-memory"
import {
  loadWorkingMemory,
  updateWorkingMemory,
  formatWorkingMemoryForPrompt,
  workingMemoryCacheSize,
  WORKING_MEMORY_CACHE_MAX,
} from "@/lib/memory/working-memory"
import { DEFAULT_MEMORY_CONFIG } from "@/lib/memory/types"

const USER = "user_tools"
let threadN = 0

function ctx(overrides: Partial<MemoryToolContext> = {}): MemoryToolContext {
  return {
    threadId: `thread_${++threadN}`,
    workingMemoryUserId: USER,
    workingMemoryEnabled: true,
    profileUserId: USER,
    semanticUserId: null,
    userMessage: "msg",
    ...overrides,
  }
}
const newState = (): MemoryToolState => ({ used: false, forgot: false })

beforeEach(() => {
  fakeDb.reset()
  generateTextMock.mockReset()
  generateTextMock.mockResolvedValue({ text: "summary" })
})

describe("saveMemory", () => {
  it("writes the profile before returning and says so (no 'queued')", async () => {
    const c = ctx()
    const s = newState()
    const res = await executeSaveMemory(c, s, {
      facts: [{ category: "bio", label: "base", value: "Bandung", confidence: 0.9 }],
    })
    expect(res.success).toBe(true)
    expect(res.stored.profile).toBe("saved")
    expect(res).not.toHaveProperty("queued")
    expect(s.used).toBe(true)
    // A brand-new conversation sees it immediately — no stream-end dependency.
    const text = formatUserProfileForPrompt(await loadUserProfile(USER))
    expect(text).toContain("location: Bandung")
  })

  it("update via tool replaces the old value for the next conversation (CHAT-021)", async () => {
    await executeSaveMemory(ctx(), newState(), { facts: [{ category: "bio", label: "location", value: "Depok", confidence: 0.9 }] })
    await executeSaveMemory(ctx(), newState(), { facts: [{ category: "bio", label: "kota", value: "Bandung", confidence: 0.9 }] })
    const text = formatUserProfileForPrompt(await loadUserProfile(USER))
    expect(text).toContain("location: Bandung")
    expect(text).not.toContain("Depok")
  })

  it("reports failure truthfully when the write fails", async () => {
    const spy = vi.spyOn(fakeDb.prisma.userMemory, "findFirst").mockRejectedValueOnce(new Error("db down"))
    const res = await executeSaveMemory(ctx({ workingMemoryEnabled: false }), newState(), {
      facts: [{ category: "bio", label: "name", value: "Evan", confidence: 0.9 }],
    })
    spy.mockRestore()
    expect(res.success).toBe(false)
    expect(res.stored.profile).toBe("failed")
    expect(res.error).toMatch(/db down/)
  })

  it("anonymous (no profile user) only touches working memory", async () => {
    const c = ctx({ profileUserId: null, workingMemoryUserId: "anon_x" })
    const res = await executeSaveMemory(c, newState(), { facts: [{ category: "bio", label: "name", value: "Evan", confidence: 0.9 }] })
    expect(res.stored.profile).toBe("not_enabled")
    expect(res.stored.workingMemory).toBe("saved")
    expect(await loadUserProfile(USER)).toBeNull()
  })
})

describe("forgetMemory (CHAT-022)", () => {
  it("removes from profile and working memory, returns what was removed, keeps the rest", async () => {
    const c = ctx()
    await executeSaveMemory(c, newState(), {
      facts: [
        { category: "bio", label: "location", value: "Depok", confidence: 0.9 },
        { category: "bio", label: "name", value: "Evan", confidence: 0.9 },
      ],
    })
    // Another open session of the same user also holds it in working memory.
    const other = ctx()
    await executeSaveMemory(other, newState(), { facts: [{ category: "bio", label: "lokasi", value: "Depok", confidence: 0.9 }] })

    const s = newState()
    const res = await executeForgetMemory(c, s, { keys: ["location"] })
    expect(res.success).toBe(true)
    expect(res.removed.facts).toEqual([{ key: "location", value: "Depok" }])
    expect(res.removed.workingMemoryItems).toBeGreaterThanOrEqual(2)
    expect(s.forgot).toBe(true)
    expect(s.used).toBe(true)

    const profileText = formatUserProfileForPrompt(await loadUserProfile(USER))
    expect(profileText).not.toContain("Depok")
    expect(profileText).toContain("name: Evan") // positive control

    const wmCurrent = formatWorkingMemoryForPrompt(await loadWorkingMemory(c.threadId))
    expect(wmCurrent).not.toContain("Depok")
    expect(wmCurrent).toContain("Evan")
    const otherRow = fakeDb.rows.get(`wm_${other.threadId}`)!
    expect(otherRow.value).not.toContain("Depok")
  })

  it("says truthfully when nothing matched", async () => {
    await executeSaveMemory(ctx(), newState(), { facts: [{ category: "bio", label: "name", value: "Evan", confidence: 0.9 }] })
    const res = await executeForgetMemory(ctx(), newState(), { keywords: ["Surabaya"] })
    expect(res.success).toBe(true)
    expect(res.removed.facts).toEqual([])
    expect(res.message).toMatch(/nothing was deleted/i)
  })

  it("rejects an empty request instead of pretending", async () => {
    const res = await executeForgetMemory(ctx(), newState(), {})
    expect(res.success).toBe(false)
  })

  it("is registered next to saveMemory", () => {
    const { tools } = createMemoryTools(ctx())
    expect(Object.keys(tools).sort()).toEqual(["forgetMemory", "saveMemory"])
  })
})

describe("working-memory cache bounds (CHAT-058 leak)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("stays under the size cap", async () => {
    for (let i = 0; i < WORKING_MEMORY_CACHE_MAX + 50; i++) await loadWorkingMemory(`cap_${i}`)
    expect(workingMemoryCacheSize()).toBeLessThanOrEqual(WORKING_MEMORY_CACHE_MAX)
  })

  it("does not serve an expired session from cache", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const t = "expiring_thread"
    await updateWorkingMemory(USER, t, "", "", "m", [], [
      { id: "f1", subject: "user", predicate: "location", object: "Depok", confidence: 0.9, source: "m", createdAt: new Date() },
    ], { extract: false })
    expect(formatWorkingMemoryForPrompt(await loadWorkingMemory(t))).toContain("Depok")

    vi.setSystemTime(Date.now() + DEFAULT_MEMORY_CONFIG.workingMemoryTTL + 60_000)
    expect(formatWorkingMemoryForPrompt(await loadWorkingMemory(t))).not.toContain("Depok")
  })

  it("replaces a working-memory fact under a synonym label", async () => {
    const t = "wm_replace"
    const mk = (p: string, o: string) => ({ id: `${p}${o}`, subject: "user", predicate: p, object: o, confidence: 0.9, source: "m", createdAt: new Date() })
    await updateWorkingMemory(USER, t, "", "", "m", [], [mk("location", "Depok")], { extract: false })
    await updateWorkingMemory(USER, t, "", "", "m", [], [mk("base", "Bandung")], { extract: false })
    const text = formatWorkingMemoryForPrompt(await loadWorkingMemory(t))
    expect(text).toContain("Bandung")
    expect(text).not.toContain("Depok")
  })
})
