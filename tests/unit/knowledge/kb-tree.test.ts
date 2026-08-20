import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Nested knowledge bases.
 *
 * The behaviour worth pinning is the selection rule — picking a KB picks its
 * whole subtree — and the guards that stop a tree from becoming unusable:
 * cycles (which would hide a branch from the root forever) and unbounded depth
 * (which would make expansion cost grow per chat turn).
 *
 * These run against an in-memory table rather than a database because every
 * rule here is graph logic, not SQL.
 */

type Row = { id: string; parentId: string | null; organizationId: string | null }

let rows: Row[] = []

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeBaseGroup: {
      findMany: vi.fn(async ({ where, select: _select }: never) => {
        const w = where as { parentId?: { in: string[] } }
        const parents = w?.parentId?.in ?? []
        return rows.filter((r) => r.parentId !== null && parents.includes(r.parentId))
      }),
      findUnique: vi.fn(async ({ where }: never) => {
        const w = where as { id: string }
        return rows.find((r) => r.id === w.id) ?? null
      }),
      count: vi.fn(async ({ where }: never) => {
        const w = where as { parentId: string }
        return rows.filter((r) => r.parentId === w.parentId).length
      }),
    },
  },
}))

import {
  MAX_KB_DEPTH,
  KbTreeError,
  expandGroupIds,
  assertParentAllowed,
  depthOf,
  subtreeHeight,
  buildTree,
  flattenTree,
  expandSelectionLocally,
} from "@/features/knowledge/groups/tree"

/** "Kurikulum Merdeka" > "Kelas VII" > {"IPA", "Matematika"}, plus a sibling. */
function seedLibrary() {
  rows = [
    { id: "kurikulum", parentId: null, organizationId: "org1" },
    { id: "kelas7", parentId: "kurikulum", organizationId: "org1" },
    { id: "ipa", parentId: "kelas7", organizationId: "org1" },
    { id: "matematika", parentId: "kelas7", organizationId: "org1" },
    { id: "arsip", parentId: null, organizationId: "org1" },
    { id: "other-org", parentId: null, organizationId: "org2" },
  ]
}

beforeEach(() => {
  seedLibrary()
  vi.clearAllMocks()
})

describe("selecting a KB selects its subtree", () => {
  it("picking the parent reaches every descendant", async () => {
    const scope = await expandGroupIds(["kurikulum"])
    expect(new Set(scope)).toEqual(new Set(["kurikulum", "kelas7", "ipa", "matematika"]))
  })

  it("picking one child stays inside that child", async () => {
    expect(await expandGroupIds(["ipa"])).toEqual(["ipa"])
  })

  it("picking a mid-level node takes what is under it and nothing above", async () => {
    const scope = await expandGroupIds(["kelas7"])
    expect(new Set(scope)).toEqual(new Set(["kelas7", "ipa", "matematika"]))
    expect(scope).not.toContain("kurikulum")
  })

  it("never returns an id twice when parent and child are both selected", async () => {
    const scope = await expandGroupIds(["kurikulum", "ipa"])
    expect(scope.length).toBe(new Set(scope).size)
  })

  it("keeps unknown ids instead of dropping them", async () => {
    // Dropping a stale id would remove the filter entirely, widening a search
    // that was meant to be narrowed.
    expect(await expandGroupIds(["deleted-kb"])).toEqual(["deleted-kb"])
  })

  it("returns nothing for an empty selection", async () => {
    expect(await expandGroupIds([])).toEqual([])
  })

  it("terminates on a pre-existing cycle rather than hanging", async () => {
    rows = [
      { id: "a", parentId: "b", organizationId: "org1" },
      { id: "b", parentId: "a", organizationId: "org1" },
    ]
    const scope = await expandGroupIds(["a"])
    expect(new Set(scope)).toEqual(new Set(["a", "b"]))
  })
})

describe("guards on choosing a parent", () => {
  it("refuses to make a KB its own parent", async () => {
    await expect(
      assertParentAllowed({ parentId: "ipa", childId: "ipa", organizationId: "org1" }),
    ).rejects.toMatchObject({ code: "SELF_PARENT" })
  })

  it("refuses to nest a KB inside its own descendant", async () => {
    // Allowing this detaches kurikulum+kelas7 from the root entirely: the pair
    // would point at each other and appear nowhere in the tree.
    await expect(
      assertParentAllowed({ parentId: "ipa", childId: "kurikulum", organizationId: "org1" }),
    ).rejects.toMatchObject({ code: "CYCLE" })
  })

  it("refuses a parent that does not exist", async () => {
    await expect(
      assertParentAllowed({ parentId: "ghost", organizationId: "org1" }),
    ).rejects.toMatchObject({ code: "PARENT_NOT_FOUND" })
  })

  it("refuses a parent owned by another organization", async () => {
    // Otherwise nesting becomes a way to pull someone else's KB into your tree
    // and have retrieval read it.
    await expect(
      assertParentAllowed({ parentId: "other-org", organizationId: "org1" }),
    ).rejects.toMatchObject({ code: "CROSS_ORG" })
  })

  it("allows a global KB as a parent", async () => {
    rows.push({ id: "global", parentId: null, organizationId: null })
    await expect(
      assertParentAllowed({ parentId: "global", organizationId: "org1" }),
    ).resolves.toBeUndefined()
  })

  it("allows an ordinary move", async () => {
    await expect(
      assertParentAllowed({ parentId: "arsip", childId: "ipa", organizationId: "org1" }),
    ).resolves.toBeUndefined()
  })

  it("rejects a move that would push the tree past the depth cap", async () => {
    // Build a chain exactly MAX_KB_DEPTH deep, then try to hang another below.
    rows = Array.from({ length: MAX_KB_DEPTH }, (_, i) => ({
      id: `n${i}`,
      parentId: i === 0 ? null : `n${i - 1}`,
      organizationId: "org1",
    }))
    rows.push({ id: "extra", parentId: null, organizationId: "org1" })

    expect(await depthOf(`n${MAX_KB_DEPTH - 1}`)).toBe(MAX_KB_DEPTH)
    await expect(
      assertParentAllowed({
        parentId: `n${MAX_KB_DEPTH - 1}`,
        childId: "extra",
        organizationId: "org1",
      }),
    ).rejects.toMatchObject({ code: "TOO_DEEP" })
  })

  it("counts the moved subtree's own height against the cap", async () => {
    // Moving a 2-level subtree needs room for both levels, not just its root.
    rows = [
      { id: "root", parentId: null, organizationId: "org1" },
      { id: "mid", parentId: "root", organizationId: "org1" },
      { id: "leaf", parentId: "mid", organizationId: "org1" },
      { id: "tall-a", parentId: null, organizationId: "org1" },
      { id: "tall-b", parentId: "tall-a", organizationId: "org1" },
      { id: "tall-c", parentId: "tall-b", organizationId: "org1" },
    ]
    expect(await subtreeHeight("tall-a")).toBe(2)
    // leaf sits at depth 3; hanging a 2-high subtree under it needs depth 6.
    await expect(
      assertParentAllowed({ parentId: "leaf", childId: "tall-a", organizationId: "org1" }),
    ).rejects.toMatchObject({ code: "TOO_DEEP" })
  })

  it("reports failures as KbTreeError so the API can map them to a status", async () => {
    await expect(
      assertParentAllowed({ parentId: "ghost", organizationId: "org1" }),
    ).rejects.toBeInstanceOf(KbTreeError)
  })
})

describe("rendering helpers", () => {
  const flat = [
    { id: "kurikulum", name: "Kurikulum Merdeka", parentId: null },
    { id: "kelas7", name: "Kelas VII", parentId: "kurikulum" },
    { id: "ipa", name: "IPA", parentId: "kelas7" },
    { id: "arsip", name: "Arsip", parentId: null },
  ]

  it("nests a flat list and stamps depth", () => {
    const tree = buildTree(flat)
    expect(tree.map((t) => t.node.id)).toEqual(["kurikulum", "arsip"])
    expect(flattenTree(tree).map((r) => [r.id, r.depth])).toEqual([
      ["kurikulum", 0],
      ["kelas7", 1],
      ["ipa", 2],
      ["arsip", 0],
    ])
  })

  it("treats a parent outside the list as a root instead of dropping the row", () => {
    // Happens for real whenever the list is org-scoped and the parent is a
    // global KB; dropping it would make the user's own KB vanish.
    const tree = buildTree([{ id: "orphan", name: "Orphan", parentId: "not-in-list" }])
    expect(tree.map((t) => t.node.id)).toEqual(["orphan"])
  })

  it("previews the selected scope without hitting the database", () => {
    // The picker needs "3 selected" the instant a parent is ticked.
    const scope = expandSelectionLocally(flat, ["kurikulum"])
    expect(new Set(scope)).toEqual(new Set(["kurikulum", "kelas7", "ipa"]))
    expect(expandSelectionLocally(flat, ["ipa"])).toEqual(["ipa"])
  })

  it("agrees with the server-side expansion", async () => {
    const local = expandSelectionLocally(
      [
        { id: "kurikulum", name: "k", parentId: null },
        { id: "kelas7", name: "k7", parentId: "kurikulum" },
        { id: "ipa", name: "ipa", parentId: "kelas7" },
        { id: "matematika", name: "mtk", parentId: "kelas7" },
      ],
      ["kurikulum"],
    )
    const server = await expandGroupIds(["kurikulum"])
    expect(new Set(local)).toEqual(new Set(server))
  })
})
