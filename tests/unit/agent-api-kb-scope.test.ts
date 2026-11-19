/**
 * Unit tests for grade isolation of `knowledge_base_ids` and
 * `GET /api/v1/knowledge-bases` on the v1 API.
 *
 * PRD: a student's grade decides the available curriculum, and every UGM
 * assistant is bound to one grade, so a grade assistant must never read —
 * or even learn the id of — another grade's books. Verified live on
 * 2026-11-19: the old rule checked organisation membership only, so a
 * Kelas 2 key could read Kelas 12 books by sending that grade's group id
 * (or `["*"]` for the whole organisation), and the listing endpoint handed
 * every organisation group to every key.
 *
 * The prisma mock is WHERE-AWARE: it answers `findMany` by actually
 * applying the where clause (organisation + the id/parentId OR of the scope
 * lookup) to the fixture rows. A naive mock returning every row for every
 * query would let the leak tests below pass against a wrong implementation
 * — the deliberate-failure check on the intersection rule relies on this
 * mock distinguishing the scope query from an organisation-wide one.
 *
 * The route tests go through the real `authenticateV1Request`; only the
 * keys repository is stubbed. No network, no database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── module mocks ─────────────────────────────────────────────────────────────
// Factories only create deferred wrappers (the vi.fn()s are dereferenced at
// call time), so vi.mock's hoisting above these consts is safe. This file
// runs first in the agent-api bun run, so its registrations are the ones
// later files see until they re-register their own (bun's vi.mock registry
// is process-global; the module instances themselves are per file).

const groupFindMany = vi.fn()
const assistantFindUnique = vi.fn()
const findAgentApiKeyByHash = vi.fn()
const findAgentApiKeyByKey = vi.fn()
const findAssistantById = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeBaseGroup: { findMany: (...a: unknown[]) => groupFindMany(...a) },
    assistant: { findUnique: (...a: unknown[]) => assistantFindUnique(...a) },
  },
}))

vi.mock("@/features/agent-api-keys/repository", () => ({
  findAgentApiKeysByOrganization: vi.fn(),
  findAgentApiKeysByAssistantId: vi.fn(),
  findAgentApiKeyById: vi.fn(),
  findAgentApiKeyByKey: (...a: unknown[]) => findAgentApiKeyByKey(...a),
  findAgentApiKeyByHash: (...a: unknown[]) => findAgentApiKeyByHash(...a),
  createAgentApiKey: vi.fn(),
  updateAgentApiKey: vi.fn(),
  deleteAgentApiKey: vi.fn(),
  // Async like the real one, in case a later file binds it before
  // re-registering its own (the chat path calls .catch() on the result).
  incrementAgentApiKeyUsage: vi.fn(async () => ({})),
  findAssistantById: (...a: unknown[]) => findAssistantById(...a),
}))

import { resolveRequestedGroupIds } from "@/features/agent-api/service"
import { GET as listKnowledgeBases } from "@/app/api/v1/knowledge-bases/route"

// ── fixtures ─────────────────────────────────────────────────────────────────

const ORG = "org-ugm"
const OTHER_ORG = "org-lain"

/**
 * The shape the organisation actually has: two grades (each a group with
 * subject children), an archive outside any grade, and one group owned by
 * another tenant. The Kelas 8 assistant under test is bound to the grade
 * group only, the way every grade except Kelas 7 is configured.
 */
const GROUPS = [
  { id: "g_smp8", name: "SMP Kelas 8", description: "Buku kelas 8", parentId: null, organizationId: ORG, docCount: 0 },
  { id: "g_ipa8", name: "IPA — Kelas 8", description: null, parentId: "g_smp8", organizationId: ORG, docCount: 3 },
  { id: "g_mtk8", name: "Matematika — Kelas 8", description: "Matematika kelas 8", parentId: "g_smp8", organizationId: ORG, docCount: 5 },
  { id: "g_sma12", name: "SMA Kelas 12", description: null, parentId: null, organizationId: ORG, docCount: 0 },
  { id: "g_ipa12", name: "IPA — Kelas 12", description: null, parentId: "g_sma12", organizationId: ORG, docCount: 4 },
  { id: "g_arsip", name: "Arsip — Buku Guru", description: null, parentId: null, organizationId: ORG, docCount: 9 },
  { id: "g_other", name: "Biologi", description: null, parentId: null, organizationId: OTHER_ORG, docCount: 7 },
]

/** The `where` shapes `assistantScopeGroups` issues (and the organisation-
 * wide one the old rule used, so a regression actually shows up). */
interface FindManyWhere {
  organizationId?: string | null
  OR?: Array<{ id?: { in: string[] }; parentId?: { in: string[] } }>
}

/** Where-aware stand-in for prisma.knowledgeBaseGroup.findMany: filters the
 * fixtures exactly like prisma would for the clauses in play, and returns
 * name-ascending rows in the shape the helper selects. */
const answerFindMany = async (args?: { where?: FindManyWhere }) => {
  const where = args?.where
  let rows = GROUPS
  if (where && "organizationId" in where) {
    rows = rows.filter((g) => g.organizationId === where.organizationId)
  }
  const or = where?.OR
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
}

/** Elise Kelas 8: bound to the grade group, its subjects reachable as children. */
const KELAS_8 = { organizationId: ORG, knowledgeBaseGroupIds: ["g_smp8"] }

beforeEach(() => {
  groupFindMany.mockReset()
  groupFindMany.mockImplementation(answerFindMany)
  assistantFindUnique.mockReset()
  assistantFindUnique.mockResolvedValue(KELAS_8)
})

// ── resolveRequestedGroupIds ─────────────────────────────────────────────────

describe("resolveRequestedGroupIds — grade isolation", () => {
  it("omitted ids keep the assistant's own groups, at no query cost (positive control)", async () => {
    const r = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, undefined)
    expect(r).toEqual({ ids: ["g_smp8"] })
    // The default path must not cost a lookup.
    expect(groupFindMany).not.toHaveBeenCalled()
  })

  it("an id of the assistant's child subject is allowed (positive control)", async () => {
    // Kelas 8 binds the grade group; "IPA — Kelas 8" sits under it.
    const r = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, ["g_ipa8"])
    expect(r).toEqual({ ids: ["g_ipa8"] })
  })

  it("another grade's id (same organisation) is dropped silently", async () => {
    // Kelas 12's IPA group exists in the same organisation — the response
    // must not honour it, and must not reveal why.
    const r = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, ["g_smp8", "g_ipa12"])
    expect(r).toEqual({ ids: ["g_smp8"] })
  })

  it("only out-of-scope ids ⇒ 400 error pointing at both listing endpoints", async () => {
    const r = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, ["g_ipa12"])
    expect(r).toHaveProperty("error")
    const error = (r as { error: string }).error
    expect(error).toMatch(/GET \/api\/v1\/knowledge-bases/)
    expect(error).toMatch(/GET \/api\/v1\/mapel/)
  })

  it("cannot probe: the error is identical for an out-of-scope id and one that never existed", async () => {
    // Non-disclosure, same as the cross-tenant rule: the wording must not
    // let a caller distinguish "exists in another grade" from "not real".
    const otherGrade = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, ["g_ipa12"])
    const neverExisted = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, ["kb_nope"])
    expect(neverExisted).toHaveProperty("error")
    expect((neverExisted as { error: string }).error).toBe((otherGrade as { error: string }).error)
  })

  it("'*' widens to the assistant scope only — not the organisation's other groups", async () => {
    const r = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, ["*"])
    expect(r).toEqual({ ids: ["g_ipa8", "g_mtk8", "g_smp8"] })
    // The organisation's other grade, the archive and the other tenant are
    // all absent — `["*"]` no longer means "every group the org owns".
    const ids = (r as { ids: string[] }).ids
    expect(ids).not.toContain("g_sma12")
    expect(ids).not.toContain("g_ipa12")
    expect(ids).not.toContain("g_arsip")
    expect(ids).not.toContain("g_other")
  })

  it("a cross-tenant id is still dropped", async () => {
    const r = await resolveRequestedGroupIds(ORG, KELAS_8.knowledgeBaseGroupIds, ["g_smp8", "g_other"])
    expect(r).toEqual({ ids: ["g_smp8"] })
  })

  it("an assistant with no groups: omitted ids keep today's behaviour, explicit ids error", async () => {
    // Omitted ⇒ undefined means "no KB filter" downstream, as before.
    expect(await resolveRequestedGroupIds(ORG, [], undefined)).toEqual({ ids: undefined })
    // Explicit (or '*') ⇒ nothing is in scope, and the empty scope is known
    // without a query — the same early return listMapelForAssistant uses.
    expect(await resolveRequestedGroupIds(ORG, [], ["g_smp8"])).toHaveProperty("error")
    expect(await resolveRequestedGroupIds(ORG, [], ["*"])).toHaveProperty("error")
    expect(groupFindMany).not.toHaveBeenCalled()
  })
})

// ── GET /api/v1/knowledge-bases ──────────────────────────────────────────────

describe("GET /api/v1/knowledge-bases — the assistant scope only", () => {
  const KEY = "rantai_sk_test_kb_scope_fixture"

  beforeEach(() => {
    findAgentApiKeyByHash.mockReset()
    findAgentApiKeyByKey.mockReset()
    findAssistantById.mockReset()
    findAgentApiKeyByHash.mockResolvedValue({
      id: "key_kls8",
      key: KEY,
      keyHash: "fixture-hash",
      assistantId: "asst_kls8",
      scopes: ["chat"],
      ipWhitelist: [],
      enabled: true,
      expiresAt: null,
    })
    findAssistantById.mockResolvedValue({ id: "asst_kls8", name: "Elise Kelas 8", emoji: "📘" })
    assistantFindUnique.mockResolvedValue(KELAS_8)
  })

  const list = () =>
    listKnowledgeBases(
      new Request("http://app.test/api/v1/knowledge-bases", {
        headers: { authorization: `Bearer ${KEY}` },
      }),
    )

  it("lists every in-scope group and nothing else (positive control: all present)", async () => {
    const res = await list()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { object: string; data: Array<{ id: string }> }
    expect(body.object).toBe("list")
    // Exactly the Kelas 8 scope: the grade group and its two subjects.
    expect(body.data.map((g) => g.id)).toEqual(["g_ipa8", "g_mtk8", "g_smp8"])
    // Not the other grade, not the archive, not the other tenant — the
    // listing must not even reveal that those ids exist.
    expect(body.data.map((g) => g.id)).not.toContain("g_sma12")
    expect(body.data.map((g) => g.id)).not.toContain("g_ipa12")
    expect(body.data.map((g) => g.id)).not.toContain("g_arsip")
    expect(body.data.map((g) => g.id)).not.toContain("g_other")
  })

  it("keeps today's entry shape, marking the assistant's own groups as default", async () => {
    const body = (await (await list()).json()) as { data: unknown[] }
    expect(body.data).toEqual([
      { id: "g_ipa8", name: "IPA — Kelas 8", description: null, document_count: 3, is_default: false },
      { id: "g_mtk8", name: "Matematika — Kelas 8", description: "Matematika kelas 8", document_count: 5, is_default: false },
      { id: "g_smp8", name: "SMP Kelas 8", description: "Buku kelas 8", document_count: 0, is_default: true },
    ])
  })

  it("follows the authenticated key's assistant, not a fixed view: a Kelas 12 key lists Kelas 12", async () => {
    assistantFindUnique.mockResolvedValue({ organizationId: ORG, knowledgeBaseGroupIds: ["g_sma12"] })
    const body = (await (await list()).json()) as { data: Array<{ id: string }> }
    expect(body.data.map((g) => g.id)).toEqual(["g_ipa12", "g_sma12"])
  })

  it("an assistant with no groups gets an empty list, not the organisation's", async () => {
    assistantFindUnique.mockResolvedValue({ organizationId: ORG, knowledgeBaseGroupIds: [] })
    const body = (await (await list()).json()) as { object: string; data: unknown[] }
    expect(body).toEqual({ object: "list", data: [] })
  })
})
