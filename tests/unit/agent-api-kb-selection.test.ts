/**
 * Unit tests for per-request knowledge-base selection on the v1 API.
 *
 * Two properties matter here and they pull in opposite directions. A caller
 * must be able to widen a request to every base its organisation owns, and a
 * caller must never be able to reach a base owned by anyone else — the id is a
 * cuid supplied by the client, so "trust the id" is not available.
 *
 * The third property is quieter but is the one that would embarrass us live: if
 * a caller asks for one subject and we cannot honour it, we must fail rather
 * than fall back to the whole corpus. An answer drawn from the biology book to
 * a maths question is worse than an error, because nobody can see it happened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { knowledgeBaseGroup: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

const { resolveRequestedGroupIds } = await import("@/features/agent-api/service")

const OWNED = [{ id: "kb_math" }, { id: "kb_bio" }, { id: "kb_indo" }]

beforeEach(() => {
  findMany.mockReset()
  findMany.mockResolvedValue(OWNED)
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

  it("widens beyond the assistant's own set when the org owns more", async () => {
    // The assistant is configured with maths only; the caller asks for biology
    // and gets it, because both belong to the same organisation.
    const r = await resolveRequestedGroupIds("org1", ["kb_math"], ["kb_bio"])
    expect(r).toEqual({ ids: ["kb_bio"] })
  })

  it("expands '*' to every base the organisation owns", async () => {
    const r = await resolveRequestedGroupIds("org1", ["kb_math"], ["*"])
    expect(r).toEqual({ ids: ["kb_math", "kb_bio", "kb_indo"] })
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

  it("errors on '*' when the organisation owns nothing", async () => {
    findMany.mockResolvedValue([])
    const r = await resolveRequestedGroupIds("org1", [], ["*"])
    expect(r).toHaveProperty("error")
  })

  it("scopes the ownership lookup to the caller's organisation", async () => {
    await resolveRequestedGroupIds("org1", [], ["kb_math"])
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org1" } }),
    )
  })
})
