/**
 * Unit tests for per-subject ("mapel") selection on the v1 API.
 *
 * The property that matters is that a frontend which only knows the subject
 * name reaches the right knowledge base — and never a different one. A subject
 * that silently resolves to nothing is worse than an error, because the chat
 * answer then comes from whatever the assistant was configured with and nobody
 * can see the filter was dropped. So every "this is not a subject" assertion
 * here is paired with a "this one is".
 */
import { describe, it, expect } from "vitest"
import { mapelFromGroupName, mapelGroupsFor, normalizeMapel, resolveMapel } from "@/features/agent-api/mapel"

describe("mapelFromGroupName", () => {
  it("reads the subject out of a grade-group name", () => {
    expect(mapelFromGroupName("IPA — Kelas 8")).toBe("IPA")
    expect(mapelFromGroupName("Kejuruan (SMK) — Kelas 10")).toBe("Kejuruan (SMK)")
    expect(mapelFromGroupName("Agama Islam — Kelas 7")).toBe("Agama Islam")
  })

  it("rejects a grade group that names no subject", () => {
    expect(mapelFromGroupName("SMP Kelas 8")).toBeNull()
    expect(mapelFromGroupName("Test")).toBeNull()
  })

  it("rejects an archive whose name contains the dash but no grade", () => {
    // "Arsip — Buku Guru" is the case that makes a bare dash check wrong.
    expect(mapelFromGroupName("Arsip — Buku Guru")).toBeNull()
    expect(mapelFromGroupName("Arsip — Buku Guru — Kelas 8")).toBe("Arsip — Buku Guru")
  })

  it("rejects a hyphen where the em dash belongs", () => {
    expect(mapelFromGroupName("IPA - Kelas 8")).toBeNull()
    expect(mapelFromGroupName("IPA — Kelas 8")).toBe("IPA")
  })

  it("rejects a grade outside the 1–12 range the naming uses", () => {
    expect(mapelFromGroupName("IPA — Kelas 123")).toBeNull()
    expect(mapelFromGroupName("IPA — Kelas 12")).toBe("IPA")
  })
})

describe("normalizeMapel", () => {
  it("makes case and whitespace irrelevant", () => {
    expect(normalizeMapel("  IPA  ")).toBe("ipa")
    expect(normalizeMapel("Agama\tIslam")).toBe("agama islam")
    expect(normalizeMapel("Agama  Islam")).toBe("agama islam")
  })
})

// A grade-8 assistant is scoped to its grade group; the subjects sit under it.
const SCOPE = ["g_smp8"]
const GROUPS = [
  { id: "g_smp8", name: "SMP Kelas 8", parentId: null, documentCount: 0 },
  { id: "g_ipa8", name: "IPA — Kelas 8", parentId: "g_smp8", documentCount: 3 },
  { id: "g_mtk8", name: "Matematika — Kelas 8", parentId: "g_smp8", documentCount: 5 },
  { id: "g_arsip", name: "Arsip — Buku Guru", parentId: "g_smp8", documentCount: 9 },
  { id: "g_empty", name: "IPS — Kelas 8", parentId: "g_smp8", documentCount: 0 },
  { id: "g_other", name: "Biologi — Kelas 10", parentId: "g_sma10", documentCount: 7 },
  { id: "g_sma10", name: "SMA Kelas 10", parentId: null, documentCount: 0 },
]

describe("mapelGroupsFor", () => {
  it("includes subjects that are children of a scoped grade group", () => {
    const list = mapelGroupsFor(GROUPS, SCOPE)
    expect(list.map((m) => m.mapel)).toEqual(["IPA", "Matematika"])
    expect(list.find((m) => m.mapel === "IPA")).toEqual({
      mapel: "IPA", knowledge_base_id: "g_ipa8", document_count: 3,
    })
  })

  it("includes subjects that are scoped directly (the grade-7 layout)", () => {
    const grade7 = [
      { id: "g_ipa7", name: "IPA — Kelas 7", parentId: null, documentCount: 2 },
      { id: "g_mtk7", name: "Matematika — Kelas 7", parentId: null, documentCount: 4 },
    ]
    expect(mapelGroupsFor(grade7, ["g_ipa7"]).map((m) => m.mapel)).toEqual(["IPA"])
    expect(mapelGroupsFor(grade7, ["g_ipa7", "g_mtk7"]).map((m) => m.mapel)).toEqual(["IPA", "Matematika"])
  })

  it("leaves out groups outside the scope", () => {
    const list = mapelGroupsFor(GROUPS, SCOPE)
    expect(list.map((m) => m.knowledge_base_id)).not.toContain("g_other")
    expect(list.map((m) => m.mapel)).toEqual(["IPA", "Matematika"])
    // Nothing in scope at all: no subject is reachable.
    expect(mapelGroupsFor(GROUPS, ["g_nowhere"]).map((m) => m.mapel)).toEqual([])
  })

  it("leaves out subjects that hold no documents", () => {
    expect(mapelGroupsFor(GROUPS, SCOPE).map((m) => m.mapel)).not.toContain("IPS")
    const withDocs = GROUPS.map((g) => (g.id === "g_empty" ? { ...g, documentCount: 1 } : g))
    expect(mapelGroupsFor(withDocs, SCOPE).map((m) => m.mapel)).toContain("IPS")
  })

  it("keeps one entry per subject, preferring the one with more documents", () => {
    const dupes = [
      { id: "g_a", name: "IPA — Kelas 8", parentId: null, documentCount: 1 },
      { id: "g_b", name: "ipa — Kelas 8", parentId: null, documentCount: 4 },
    ]
    const list = mapelGroupsFor(dupes, ["g_a", "g_b"])
    expect(list).toHaveLength(1)
    expect(list[0].knowledge_base_id).toBe("g_b")
  })

  it("sorts by subject name", () => {
    const list = mapelGroupsFor(GROUPS, SCOPE)
    expect(list.map((m) => m.mapel)).toEqual([...list.map((m) => m.mapel)].sort((a, b) => a.localeCompare(b, "id")))
  })

  it("returns nothing when the assistant has no scoped groups", () => {
    expect(mapelGroupsFor(GROUPS, [])).toEqual([])
  })
})

describe("resolveMapel", () => {
  const available = mapelGroupsFor(GROUPS, SCOPE)

  it("resolves a subject ignoring case and surrounding whitespace", () => {
    expect(resolveMapel(available, "  ipa ")).toEqual({ ids: ["g_ipa8"] })
    expect(resolveMapel(available, "Matematika")).toEqual({ ids: ["g_mtk8"] })
  })

  it("explains an unknown subject and lists what is available", () => {
    const r = resolveMapel(available, "Kimia")
    expect(r).toEqual({
      error: 'Unknown mapel "Kimia" for this assistant. Call GET /api/v1/mapel for the list.',
      available: ["IPA", "Matematika"],
    })
  })

  it("does not treat a substring as a match", () => {
    expect(resolveMapel(available, "IP")).toHaveProperty("error")
    expect(resolveMapel(available, "IPA")).toEqual({ ids: ["g_ipa8"] })
  })
})
