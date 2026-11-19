/**
 * Unit tests for per-request knowledge-base selection on the v1 API.
 *
 * Two properties matter here and they pull in opposite directions. A caller
 * must be able to name any knowledge base its ASSISTANT may read — the
 * groups bound to the assistant plus their subject children — and a caller
 * must never be able to reach a base outside that scope: not another
 * tenant's, and (grade isolation per the PRD) not another grade's base in
 * the same organisation either. The id is a cuid supplied by the client, so
 * "trust the id" is not available.
 *
 * The third property is quieter but is the one that would embarrass us live: if
 * a caller asks for one subject and we cannot honour it, we must fail rather
 * than fall back to the whole corpus. An answer drawn from the biology book to
 * a maths question is worse than an error, because nobody can see it happened.
 *
 * The prisma mock is WHERE-AWARE (it applies the scope lookup's where clause
 * to the fixtures), so these tests see the rule the code actually queries
 * with. The grade-isolation cases — child subjects, other grades, the
 * knowledge-bases route — live in agent-api-kb-scope.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { knowledgeBaseGroup: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

import { resolveRequestedGroupIds, selectedFigureNumbers } from "@/features/agent-api/service"

/** The organisation owns three groups; the assistant under test is bound to
 * maths only, and maths has no children. Rows carry the fields the scope
 * query selects (`_count` included, like prisma would return them). */
const OWNED = [
  { id: "kb_math", name: "Matematika", description: null, parentId: null, docCount: 2 },
  { id: "kb_bio", name: "Biologi", description: null, parentId: null, docCount: 4 },
  { id: "kb_indo", name: "Bahasa Indonesia", description: null, parentId: null, docCount: 1 },
]

/** Where-aware stand-in for the findMany the resolver now issues — it
 * applies the scope lookup's `OR: [{ id: { in } }, { parentId: { in } }]`
 * and returns name-ascending rows, like the query asks prisma for. */
beforeEach(() => {
  findMany.mockReset()
  findMany.mockImplementation(
    async (args?: { where?: { OR?: Array<{ id?: { in: string[] }; parentId?: { in: string[] } }> } }) => {
      const or = args?.where?.OR
      let rows = OWNED
      if (Array.isArray(or)) {
        const ids = new Set(or.flatMap((c) => c?.id?.in ?? []))
        const parents = new Set(or.flatMap((c) => c?.parentId?.in ?? []))
        rows = rows.filter((g) => ids.has(g.id) || parents.has(g.parentId ?? ""))
      }
      return rows
        .slice()
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          parentId: g.parentId,
          _count: { documents: g.docCount },
        }))
    },
  )
})

describe("resolveRequestedGroupIds", () => {
  it("falls back to the assistant's own bases when the field is absent", async () => {
    const r = await resolveRequestedGroupIds("org1", ["kb_math", "kb_bio"], undefined)
    expect(r).toEqual({ ids: ["kb_math", "kb_bio"] })
    // No lookup needed for the default path — it must not cost a query.
    expect(findMany).not.toHaveBeenCalled()
  })

  it("treats an empty array like an absent field", async () => {
    expect(await resolveRequestedGroupIds("org1", ["kb_math"], [])).toEqual({ ids: ["kb_math"] })
  })

  it("returns undefined when the assistant has no bases and none were asked for", async () => {
    // undefined means "no KB filter" downstream, which is the pre-existing
    // behaviour for an assistant configured without knowledge bases.
    expect(await resolveRequestedGroupIds("org1", [], undefined)).toEqual({ ids: undefined })
  })

  it("narrows to a single base when one is requested", async () => {
    const r = await resolveRequestedGroupIds("org1", ["kb_math", "kb_bio"], ["kb_math"])
    expect(r).toEqual({ ids: ["kb_math"] })
  })

  it("drops an id outside the assistant's scope, even within the same organisation", async () => {
    // The assistant is configured with maths only; the caller asks for
    // biology. Same organisation, but not this assistant's grade: dropped,
    // and since nothing remains, refused rather than answered from maths.
    const r = await resolveRequestedGroupIds("org1", ["kb_math"], ["kb_bio"])
    expect(r).toHaveProperty("error")
    expect((r as { error: string }).error).toMatch(/knowledge-bases/)
  })

  it("expands '*' to the assistant's scope, not the organisation's other groups", async () => {
    const r = await resolveRequestedGroupIds("org1", ["kb_math"], ["*"])
    expect(r).toEqual({ ids: ["kb_math"] })
  })

  it("drops ids belonging to another organisation", async () => {
    const r = await resolveRequestedGroupIds("org1", ["kb_math"], ["kb_math", "kb_someone_else"])
    expect(r).toEqual({ ids: ["kb_math"] })
  })

  it("errors rather than silently answering from everything", async () => {
    const r = await resolveRequestedGroupIds("org1", ["kb_math"], ["kb_someone_else"])
    expect(r).toHaveProperty("error")
    expect((r as { error: string }).error).toMatch(/knowledge-bases/)
  })

  it("errors on '*' when nothing is in scope (configured ids, no rows)", async () => {
    // The configured id points at nothing the organisation owns, so the
    // scope is empty — '*' has nothing to expand to.
    const r = await resolveRequestedGroupIds("org1", ["kb_gone"], ["*"])
    expect(r).toHaveProperty("error")
  })

  it("scopes the scope lookup to the caller's organisation", async () => {
    await resolveRequestedGroupIds("org1", ["kb_math"], ["kb_math"])
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org1" }) }),
    )
  })
})


describe("selectedFigureNumbers", () => {
  const sources = [
    { chunkType: "text" },
    { chunkType: "figure", assetKey: "k/near.png" },
    { chunkType: "figure", assetKey: "k/picked.png" },
  ]

  it("returns the 1-based source position of a figure retrieval selected", () => {
    const results = [{ chunkType: "figure", assetKey: "k/picked.png", figureSelected: true }, { chunkType: "figure", assetKey: "k/near.png" }]
    expect(selectedFigureNumbers(results, sources)).toEqual([3])
  })

  it("does not treat a figure that merely sits beside a passage as selected", () => {
    expect(selectedFigureNumbers([{ chunkType: "figure", assetKey: "k/near.png" }], sources)).toEqual([])
  })

  it("returns nothing when the selected figure is not among the sources", () => {
    expect(selectedFigureNumbers([{ chunkType: "figure", assetKey: "k/gone.png", figureSelected: true }], sources)).toEqual([])
  })
})
