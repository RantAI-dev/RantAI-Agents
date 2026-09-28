/**
 * QA CHAT-021 (update did not replace), CHAT-022 (forget did not delete),
 * CHAT-023 (fact vs preference conflict), plus summary invalidation and
 * concurrent read-merge-write on the long-term profile.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

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
import { normalizeMemoryKey } from "@/lib/memory/fact-keys"
import {
  loadUserProfile,
  saveToUserProfile,
  forgetFromUserProfile,
  updateUserProfile,
  refreshInteractionSummary,
  formatUserProfileForPrompt,
  mergeFacts,
} from "@/lib/memory/long-term-memory"
import { activeLockCount } from "@/lib/memory/profile-lock"
import type { Fact, Preference } from "@/lib/memory/types"

const USER = "user_1"
let seq = 0

function fact(label: string, value: string, confidence = 0.9): Fact {
  return { id: `f${++seq}`, subject: "user", predicate: label, object: value, confidence, source: "t", createdAt: new Date() }
}
function pref(key: string, value: string, category = "general"): Preference {
  return { id: `p${++seq}`, category, key, value, confidence: 0.9, source: "t" }
}
async function prompt() {
  return formatUserProfileForPrompt(await loadUserProfile(USER))
}

beforeEach(() => {
  fakeDb.reset()
  generateTextMock.mockReset()
  // Summary = echo of the facts it was given, so we can see what it was built from.
  generateTextMock.mockImplementation(async ({ prompt }: { prompt: string }) => ({
    text: `SUMMARY[${prompt.split("\n").find((l) => l.startsWith("Facts:"))}]`,
  }))
})

describe("predicate normalization", () => {
  it("canonicalizes case, separators and common EN/ID synonyms", () => {
    expect(normalizeMemoryKey("Base")).toBe("location")
    expect(normalizeMemoryKey("kota")).toBe("location")
    expect(normalizeMemoryKey("Lokasi")).toBe("location")
    expect(normalizeMemoryKey("warna-favorit")).toBe("favorite_color")
    expect(normalizeMemoryKey("Favorite Color")).toBe("favorite_color")
    expect(normalizeMemoryKey("favourite_colour")).toBe("favorite_color")
    expect(normalizeMemoryKey("Hobbies")).toBe("hobby")
    expect(normalizeMemoryKey("  job title ")).toBe("occupation")
    expect(normalizeMemoryKey("shoe-size")).toBe("shoe_size")
  })
})

describe("CHAT-021: an update replaces the old value", () => {
  it("Depok -> Bandung (different labels) leaves only Bandung", async () => {
    await saveToUserProfile(USER, [fact("location", "Depok")], [])
    await saveToUserProfile(USER, [fact("base", "Bandung")], [])

    const p = await loadUserProfile(USER)
    const loc = p!.facts.filter((f) => normalizeMemoryKey(f.predicate) === "location")
    expect(loc.map((f) => f.object)).toEqual(["Bandung"])
    const text = await prompt()
    expect(text).toContain("location: Bandung")
    expect(text).not.toContain("Depok")
  })

  it("positive control: genuinely multi-valued predicates still accumulate", async () => {
    await saveToUserProfile(USER, [fact("hobby", "reading")], [])
    await saveToUserProfile(USER, [fact("hobbies", "swimming")], [])
    const p = await loadUserProfile(USER)
    expect(p!.facts.filter((f) => f.predicate === "hobby").map((f) => f.object).sort()).toEqual(["reading", "swimming"])
  })

  it("repairs a legacy profile that already holds both locations (latest wins in the prompt)", () => {
    const text = formatUserProfileForPrompt({
      id: "x", userId: USER, interactionSummary: "", totalConversations: 1,
      lastInteractionAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      facts: [fact("location", "Depok"), fact("location", "Bandung")],
      preferences: [],
    })
    expect(text).toContain("location: Bandung")
    expect(text).not.toContain("Depok")
  })

  it("low-confidence guess does not overwrite a confident value", () => {
    const merged = mergeFacts([fact("location", "Bandung", 0.9)], [fact("location", "Mars", 0.3)])
    expect(merged.map((f) => f.object)).toEqual(["Bandung"])
  })
})

describe("CHAT-023: fact vs preference conflict resolves to one value", () => {
  it("fact blue then preference green -> only green", async () => {
    await saveToUserProfile(USER, [fact("warna_favorit", "blue")], [])
    await saveToUserProfile(USER, [], [pref("favorite color", "green", "color")])
    const text = await prompt()
    expect(text).toContain("favorite_color: green")
    expect(text).not.toContain("blue")
  })

  it("preference blue then fact green -> only green", async () => {
    await saveToUserProfile(USER, [], [pref("favorite_color", "blue")])
    await saveToUserProfile(USER, [fact("Favorite Colour", "green")], [])
    const p = await loadUserProfile(USER)
    expect(p!.preferences).toHaveLength(0)
    const text = await prompt()
    expect(text).toContain("favorite_color: green")
    expect(text).not.toContain("blue")
  })

  it("defensive read: a stored fact/preference conflict shows only the newer value", () => {
    const older = new Date("2026-09-01T00:00:00Z")
    const newer = new Date("2026-09-20T00:00:00Z")
    const text = formatUserProfileForPrompt({
      id: "x", userId: USER, interactionSummary: "", totalConversations: 1,
      lastInteractionAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      facts: [{ ...fact("warna_favorit", "blue"), updatedAt: older }],
      preferences: [{ ...pref("favorite_color", "green"), updatedAt: newer }],
    })
    expect(text).toContain("favorite_color: green")
    expect(text).not.toContain("blue")
  })

  it("prompt states that the most recent value is authoritative", async () => {
    await saveToUserProfile(USER, [fact("name", "Evan")], [])
    expect(await prompt()).toMatch(/most recently updated value is authoritative/)
  })
})

describe("CHAT-022: forget actually deletes", () => {
  beforeEach(async () => {
    await saveToUserProfile(
      USER,
      [fact("location", "Depok"), fact("name", "Evan"), fact("favorite_color", "green")],
      [pref("channel", "email", "communication")]
    )
  })

  it("forget by topic removes the location and nothing else", async () => {
    const r = await forgetFromUserProfile(USER, { keys: ["base"] })
    expect(r.removedFacts).toEqual([{ key: "location", value: "Depok" }])
    const text = await prompt()
    expect(text).not.toContain("Depok")
    // positive control: unrelated memory survives
    expect(text).toContain("name: Evan")
    expect(text).toContain("favorite_color: green")
    expect(text).toContain("channel: email")
  })

  it("forget by value keyword removes it", async () => {
    const r = await forgetFromUserProfile(USER, { keywords: ["depok"] })
    expect(r.removedFacts.map((f) => f.value)).toEqual(["Depok"])
    expect(await prompt()).not.toContain("Depok")
  })

  it("nothing matched -> reports nothing removed and changes nothing", async () => {
    const before = await loadUserProfile(USER)
    const r = await forgetFromUserProfile(USER, { keys: ["shoe_size"], keywords: ["Jakarta"] })
    expect(r.removedFacts).toEqual([])
    expect(r.removedPreferences).toEqual([])
    expect((await loadUserProfile(USER))!.facts).toEqual(before!.facts)
  })

  it("all=true clears everything", async () => {
    await forgetFromUserProfile(USER, { all: true })
    const p = await loadUserProfile(USER)
    expect(p!.facts).toEqual([])
    expect(p!.preferences).toEqual([])
    expect(await prompt()).not.toMatch(/Depok|Evan|green|email/)
  })
})

describe("Quick-context summary never contradicts current facts", () => {
  async function seedStaleSummary() {
    await saveToUserProfile(USER, [fact("location", "Depok")], [])
    fakeDb.foreignWrite(`profile_${USER}`, (v) => {
      v.interactionSummary = "A user based in Depok."
    })
    expect(await prompt()).toContain("Quick context: A user based in Depok.")
  }

  it("is invalidated when a fact changes", async () => {
    await seedStaleSummary()
    await saveToUserProfile(USER, [fact("location", "Bandung")], [])
    expect((await loadUserProfile(USER))!.interactionSummary).toBe("")
    expect(await prompt()).not.toContain("Depok")
  })

  it("is invalidated when something is forgotten", async () => {
    await seedStaleSummary()
    await forgetFromUserProfile(USER, { keys: ["location"] })
    expect(await prompt()).not.toContain("Depok")
  })

  it("the post-stream drain regenerates it from the current facts", async () => {
    await seedStaleSummary()
    await saveToUserProfile(USER, [fact("location", "Bandung")], [])
    await updateUserProfile(USER, "ok", "ok", "t", [], [], { extract: false })
    const s = (await loadUserProfile(USER))!.interactionSummary
    expect(s).toContain("Bandung")
    expect(s).not.toContain("Depok")
  })

  it("a summary generated from data that changed meanwhile is discarded", async () => {
    await saveToUserProfile(USER, [fact("location", "Depok")], [])
    generateTextMock.mockImplementationOnce(async () => {
      // The user updates their city while the (slow) summary call is in flight.
      await saveToUserProfile(USER, [fact("location", "Bandung")], [])
      return { text: "A user based in Depok." }
    })
    await refreshInteractionSummary(USER)
    expect((await loadUserProfile(USER))!.interactionSummary).not.toContain("Depok")
  })
})

describe("post-stream drain does not re-apply / re-extract", () => {
  it("extract:false skips the regex fallback (forget turn cannot re-add the fact)", async () => {
    await updateUserProfile(USER, "tolong lupakan, saya tinggal di Depok", "ok", "t", [], [], { extract: false })
    expect((await loadUserProfile(USER))!.facts).toEqual([])
  })

  it("positive control: with extraction on, the same message is extracted", async () => {
    await updateUserProfile(USER, "saya tinggal di Depok", "ok", "t", [], [])
    expect((await loadUserProfile(USER))!.facts.map((f) => f.object)).toContain("Depok")
  })
})

describe("concurrent profile writes (serialized read-merge-write)", () => {
  it("N concurrent saves for one user lose no update", async () => {
    const N = 20
    await Promise.all(
      Array.from({ length: N }, (_, i) => saveToUserProfile(USER, [fact(`k${i}`, `v${i}`)], []))
    )
    const p = await loadUserProfile(USER)
    expect(p!.facts.map((f) => f.predicate).sort()).toEqual(Array.from({ length: N }, (_, i) => `k${i}`).sort())
    expect(activeLockCount()).toBe(0) // lock map drains, no per-user leak
  })

  it("N concurrent drain updates count every turn", async () => {
    const N = 15
    await Promise.all(
      Array.from({ length: N }, () => updateUserProfile(USER, "hi", "hello", "t", [], [], { extract: false }))
    )
    expect((await loadUserProfile(USER))!.totalConversations).toBe(N)
  })

  it("a write from another instance between our read and write is not lost (CAS retry)", async () => {
    await saveToUserProfile(USER, [fact("name", "Evan")], [])
    let injected = false
    fakeDb.hooks.afterFindFirst = async (row) => {
      if (injected || !row) return
      injected = true
      fakeDb.foreignWrite(`profile_${USER}`, (v) => {
        ;(v.facts as Fact[]).push(fact("occupation", "engineer"))
      })
    }
    await saveToUserProfile(USER, [fact("location", "Bandung")], [])
    fakeDb.hooks.afterFindFirst = undefined
    const objs = (await loadUserProfile(USER))!.facts.map((f) => f.object).sort()
    expect(objs).toEqual(["Bandung", "Evan", "engineer"])
  })
})
