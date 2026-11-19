/**
 * Unit tests for the UAT fixes on the v1 chat API (issues 3, 4 and 7).
 *
 *  - issue 3: an ungrounded ("dead end") answer refuses instead of padding
 *    itself with the least-relevant context;
 *  - issue 4: the relevance floor drops sources whose best chunk is below
 *    the grounding threshold;
 *  - issue 7: only cited sources are returned, numbers stay the ones the
 *    model saw, and every reference carries a signed page link.
 *
 * retrieveForGroups, the LLM (streamText) and fetch are mocked; no test
 * here touches a network or a database. The kb-retrieval mock is a
 * FIXTURE-OR-PASS-THROUGH: bun's vi.mock registry is process-global (a
 * registration leaks onto every file that loads later), so this file's
 * stub must fall back to the REAL routing layer when no fixture is set —
 * otherwise it would break kb-remote-routing, which runs after this file
 * and exercises the real retrieveForGroups. The formatters are NOT mocked:
 * service.ts binds the real ones, so the system-prompt assertions see
 * production text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── module mocks ─────────────────────────────────────────────────────────────
// Factories only create deferred wrappers (the vi.fn()s are dereferenced at
// call time), so vi.mock's hoisting above these consts is safe.

const assistantFindUnique = vi.fn()
const workflowFindFirst = vi.fn()
const documentFindMany = vi.fn()
const documentFindUnique = vi.fn()
const agentApiKeyUpdate = vi.fn()
const knowledgeGroupFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assistant: { findUnique: (...a: unknown[]) => assistantFindUnique(...a) },
    workflow: { findFirst: (...a: unknown[]) => workflowFindFirst(...a) },
    document: {
      findMany: (...a: unknown[]) => documentFindMany(...a),
      findUnique: (...a: unknown[]) => documentFindUnique(...a),
    },
    knowledgeBaseGroup: { findMany: (...a: unknown[]) => knowledgeGroupFindMany(...a) },
    agentApiKey: { update: (...a: unknown[]) => agentApiKeyUpdate(...a) },
  },
}))

// Retrieval, faked per test. The pass-through reaches the real module through
// a query-busted specifier: bun keys vi.mock registrations by resolved path
// and `?real=1` makes a different module id, which is the one way to hand
// later files (kb-remote-routing) the genuine routing layer instead of
// leaking this stub onto them.
const REAL_KB_RETRIEVAL = "../../src/features/agent-api/kb-retrieval.ts?real=1"
const retrieveForGroupsMock = vi.fn()
const passThroughRetrieve = (...a: unknown[]): Promise<unknown> =>
  import(/* @vite-ignore */ REAL_KB_RETRIEVAL).then(
    (m: { retrieveForGroups: (...x: unknown[]) => Promise<unknown> }) => m.retrieveForGroups(...a),
  )

vi.mock("@/features/agent-api/kb-retrieval", () => ({
  retrieveForGroups: (...a: unknown[]) => {
    const stub = retrieveForGroupsMock(...a)
    return stub !== undefined ? stub : passThroughRetrieve(...a)
  },
}))

const streamTextMock = vi.fn()
vi.mock("ai", () => ({
  streamText: (...a: unknown[]) => streamTextMock(...a),
  convertToModelMessages: async (
    uiMessages: Array<{ role: string; parts: Array<{ type: string; text: string }> }>,
  ) => uiMessages.map((m) => ({ role: m.role, content: m.parts.map((p) => ({ type: "text", text: p.text })) })),
  stepCountIs: (n: number) => ({ stepCountIs: n }),
  // Bound by later-loaded practice modules under bun's shared registry; never
  // called by these tests.
  generateText: vi.fn(async () => ({ text: "" })),
}))

vi.mock("@/lib/llm/provider", () => ({
  getChatProvider: () => () => ({ mockProvider: true }),
  resolveModelId: (id: string) => id,
}))

vi.mock("@/lib/llm/provider-registry", () => ({
  ensureProviderRegistryLoaded: async () => {},
  getPlatformDefaultModel: (id: string) => id,
  // Bound by later-loaded practice modules under bun's shared registry; never
  // called by these tests.
  getProviderRegistry: () => ({ models: [], providers: {} }),
}))

vi.mock("@/lib/models", () => ({
  DEFAULT_MODEL_ID: "mock-model",
  isValidModelAsync: async () => true,
  // functionCalling:false keeps the tools path off; vision:false keeps the
  // VLM-at-answer path off — neither is under test here.
  getModelByIdAsync: async () => ({ capabilities: { functionCalling: false, vision: false } }),
}))

vi.mock("@/lib/skills/resolver", () => ({
  resolveSkillsForAssistant: async () => null,
}))

vi.mock("@/features/knowledge/groups/service", () => ({
  listDocumentsInKnowledgeGroups: async () => [],
}))

// Files that run before this one (ip-whitelist, keys-masking-hash, and the
// practice UAT file) register partial mocks of the keys repository; under
// bun's shared registry the chat path would otherwise bind their
// `incrementAgentApiKeyUsage: vi.fn()` (not a Promise) and crash. This file
// re-registers a working one for its own run.
vi.mock("@/features/agent-api-keys/repository", () => ({
  findAgentApiKeyByKey: vi.fn(),
  findAgentApiKeyByHash: vi.fn(),
  findAgentApiKeyById: vi.fn(),
  findAgentApiKeysByOrganization: vi.fn(),
  findAgentApiKeysByAssistantId: vi.fn(),
  findAssistantById: vi.fn(),
  createAgentApiKey: vi.fn(),
  updateAgentApiKey: vi.fn(),
  deleteAgentApiKey: vi.fn(),
  incrementAgentApiKeyUsage: vi.fn(async () => ({})),
}))

import { runV1ChatCompletion } from "@/features/agent-api/service"
import { citedSourceNumbers, selectResponseSources, scoreSources, type ScoredSource } from "@/features/agent-api/source-selection"
import {
  mintPageToken,
  pageUrlForSource,
  resolveSourcePage,
  verifyPageToken,
  attachPageUrls,
  __resetSourcePageCachesForTests,
} from "@/features/agent-api/source-links"
import { GET as sourcePageRoute } from "@/app/api/v1/sources/page/route"
import type { HybridRetrievalResult } from "@/lib/rag/retriever"
// ── fixtures ────────────────────────────────────────────────────────────────

const AUTH = {
  apiKey: { id: "key_uat", assistantId: "asst_uat", scopes: ["chat", "chat:stream"], ipWhitelist: [] },
  assistant: { id: "asst_uat", name: "Tutor UAT", emoji: null },
}

const ASSISTANT_ROW = {
  id: "asst_uat",
  name: "Tutor UAT",
  systemPrompt: "You are a helpful tutor.",
  model: "mock-model",
  useKnowledgeBase: true,
  knowledgeBaseGroupIds: ["grp_ipa"],
  organizationId: "org-1",
  modelConfig: null,
  guardRails: null,
  memoryConfig: null,
}

/** One retrieved chunk + its source card. */
interface FixtureEntry {
  title: string
  section?: string | null
  docId?: string | null
  page?: number | null
  score: number
  content?: string
  chunkType?: string | null
  assetKey?: string | null
}

/** What the old engine returns, in the shape both call sites read. The
 *  `[n]` numbering is exactly array order (see source-selection.ts). */
function oldEngineResult(entries: FixtureEntry[]): HybridRetrievalResult {
  const sources = entries.map((e) => ({
    documentId: e.docId ?? null,
    documentTitle: e.title,
    section: e.section ?? null,
    assetKey: e.assetKey ?? null,
    page: e.page ?? null,
    pages: e.page != null ? [e.page] : [],
    chunkType: e.chunkType ?? null,
    chunkIndex: 1,
    anchorChunkIndex: null,
  }))
  const results = entries.map((e, i) => ({
    chunkId: `chunk-${i + 1}`,
    documentId: e.docId ?? "doc",
    content: e.content ?? `isi ${e.title} ${e.section ?? ""}`,
    chunkIndex: i,
    documentTitle: e.title,
    section: e.section ?? undefined,
    assetKey: e.assetKey ?? null,
    page: e.page ?? null,
    chunkType: e.chunkType ?? null,
    anchorChunkIndex: null,
    figureSelected: false,
    vectorScore: e.score,
    entityScore: 0,
    graphScore: 0,
    combinedScore: e.score,
    rank: i + 1,
    contextualPrefix: null,
    relatedEntities: [],
    isNeighbor: false,
  }))
  const context = entries
    .map(
      (e, i) =>
        `[${i + 1}] ${e.title}${e.section ? ` — ${e.section}` : ""}\n${e.content ?? `isi ${e.title}`}`,
    )
    .join("\n\n---\n\n")
  return {
    context,
    sources,
    results,
    stats: {
      totalTimeMs: 1, embeddingTimeMs: 1, vectorSearchTimeMs: 1, entitySearchTimeMs: 0,
      graphSearchTimeMs: 0, fusionTimeMs: 0, vectorResults: entries.length,
      entityResults: 0, graphResults: 0, totalResults: entries.length,
    },
  }
}

/** What retrieveForGroups returns around the old engine's result — the
 *  default threshold, as the unrouted local path reports. */
function routedRetrieval(entries: FixtureEntry[], groundedMinScore = 0.4) {
  return { result: oldEngineResult(entries), groundedMinScore }
}

/** A stand-in streamText result: the members the response builders read. */
function llmResult(deltas: string[]) {
  return {
    textStream: (async function* () {
      for (const d of deltas) yield d
    })(),
    text: Promise.resolve(deltas.join("")),
    finishReason: "stop",
    totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
  }
}

interface ChatOptions {
  stream?: boolean
  sources?: "cited" | "all"
}

/** The auth object runV1ChatCompletion expects (service.ts AuthResult). */
type AuthParam = Parameters<typeof runV1ChatCompletion>[0]

async function chat(over: ChatOptions = {}): Promise<Response> {
  return runV1ChatCompletion(AUTH as AuthParam, {
    model: "mock-model",
    messages: [{ role: "user", content: "apa itu energi?" }],
    stream: over.stream ?? false,
    sources: over.sources ?? "cited",
  })
}

async function json(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>
}

async function sseFrames(res: Response): Promise<Array<Record<string, any> | "[DONE]">> {
  const body = await res.text()
  return body
    .split("\n\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => l.slice(6))
    .map((p) => (p === "[DONE]" ? "[DONE]" : JSON.parse(p)))
}

// ── environment plumbing ────────────────────────────────────────────────────

const ENV_KEYS = [
  "AGENT_API_LINK_SECRET",
  "AGENT_API_LINK_TTL_S",
  "AGENT_API_PUBLIC_URL",
  "AGENT_API_UNGROUNDED_CONTEXT",
  "AGENT_API_GROUNDED_MIN_SCORE",
  "AGENT_API_ANCHOR_FIRST_TOPIC",
  "KB_STANDALONE_QUERY_ENABLED",
  "KB_REMOTE_URL",
  "KB_REMOTE_API_KEY",
] as const
const savedEnv: Record<string, string | undefined> = {}
let realFetch: typeof fetch

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
  delete process.env.AGENT_API_LINK_SECRET
  delete process.env.AGENT_API_LINK_TTL_S
  delete process.env.AGENT_API_PUBLIC_URL
  delete process.env.AGENT_API_UNGROUNDED_CONTEXT
  delete process.env.AGENT_API_GROUNDED_MIN_SCORE
  delete process.env.AGENT_API_ANCHOR_FIRST_TOPIC
  delete process.env.KB_STANDALONE_QUERY_ENABLED
  delete process.env.KB_REMOTE_URL
  delete process.env.KB_REMOTE_API_KEY

  assistantFindUnique.mockReset()
  assistantFindUnique.mockResolvedValue(ASSISTANT_ROW)
  workflowFindFirst.mockReset()
  workflowFindFirst.mockResolvedValue(null)
  documentFindMany.mockReset()
  documentFindMany.mockResolvedValue([])
  documentFindUnique.mockReset()
  documentFindUnique.mockResolvedValue(null)
  agentApiKeyUpdate.mockReset()
  agentApiKeyUpdate.mockResolvedValue({})
  knowledgeGroupFindMany.mockReset()
  knowledgeGroupFindMany.mockResolvedValue([])
  retrieveForGroupsMock.mockReset()
  streamTextMock.mockReset()
  __resetSourcePageCachesForTests()

  realFetch = globalThis.fetch
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  globalThis.fetch = realFetch
  // Clear the retrieval stub once this file's tests are done, so the
  // kb-retrieval mock falls through to the REAL routing layer for every
  // file that runs after this one (kb-remote-routing does).
  retrieveForGroupsMock.mockReset()
})

// ── 1. grounded answer (positive control) ──────────────────────────────────

describe("grounded answer (positive control)", () => {
  it("appends the retrieved context and returns the cited source, with its page link", async () => {
    process.env.AGENT_API_LINK_SECRET = "test-secret"
    process.env.AGENT_API_PUBLIC_URL = "http://agents.example.test:8090"
    documentFindMany.mockResolvedValue([
      { id: "doc-1", s3Key: "documents/org-1/doc-1/buku-ipa.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 5_000_000 },
    ])
    retrieveForGroupsMock.mockResolvedValue(
      routedRetrieval([{ title: "Buku IPA", section: "Bab 3", docId: "doc-1", page: 2, score: 0.9 }]),
    )
    streamTextMock.mockImplementation(() => llmResult(["Energi adalah usaha [1]."]))

    const body = await json(await chat())

    // The model saw the real formatted context (real formatter, real sources).
    const system = (streamTextMock.mock.calls[0] as Array<{ system: string }>)[0].system
    expect(system).toContain("## Knowledge Base Context")
    expect(system).toContain("[1] Buku IPA — Bab 3")
    expect(system).toContain("1. Buku IPA — Bab 3")
    expect(system).not.toContain("## Knowledge Base Coverage")

    expect(body.choices[0].message.content).toBe("Energi adalah usaha [1].")
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0]).toMatchObject({
      title: "Buku IPA",
      section: "Bab 3",
      documentId: "doc-1",
      page: 2,
      number: 1,
      cited: true,
    })
    // The page link: absolute when AGENT_API_PUBLIC_URL is set, with the
    // PDF viewer fragment one page past the 0-based index.
    expect(body.sources[0].page_url).toMatch(
      /^http:\/\/agents\.example\.test:8090\/api\/v1\/sources\/page\?t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#page=3$/,
    )
    expect(body.grounded).toBe(true)
    expect(body.retrieval_score).toBe(0.9)
  })
})

// ── 2. ungrounded answers (issue 3) ────────────────────────────────────────

describe("ungrounded answers (issue 3)", () => {
  const LOW = [
    { title: "Buku Matematika", section: "Bab 9", docId: "doc-9", page: 12, score: 0.22 },
    { title: "Buku Sejarah", section: "Bab 1", docId: "doc-8", page: 3, score: 0.18 },
  ]

  it("refuses instead of padding: no context in the prompt, instruction present, sources []", async () => {
    retrieveForGroupsMock.mockResolvedValue(routedRetrieval(LOW))
    streamTextMock.mockImplementation(() => llmResult(["Maaf, informasinya tidak tersedia di buku."]))
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const body = await json(await chat())

    const system = (streamTextMock.mock.calls[0] as Array<{ system: string }>)[0].system
    expect(system).not.toContain("## Knowledge Base Context")
    expect(system).not.toContain("Buku Matematika")
    expect(system).toContain("do not cover this question")
    expect(system).toContain("not available in the available books")

    expect(body.sources).toEqual([])
    expect(body.grounded).toBe(false)
    expect(body.retrieval_score).toBe(0.22)
    // grounded/retrieval_score stay, and the answer itself is intact.
    expect(body.choices[0].message.content).toBe("Maaf, informasinya tidak tersedia di buku.")

    const line = logSpy.mock.calls
      .map((c) => c.join(" "))
      .find((l) => l.includes("[V1 API] ungrounded:"))
    expect(line).toMatch(/score=0\.22 threshold=0\.4 mode=refuse/)
    logSpy.mockRestore()
  })

  it("AGENT_API_UNGROUNDED_CONTEXT=keep restores today's behaviour", async () => {
    process.env.AGENT_API_UNGROUNDED_CONTEXT = "keep"
    retrieveForGroupsMock.mockResolvedValue(routedRetrieval(LOW))
    streamTextMock.mockImplementation(() => llmResult(["Menurut buku [1] …"]))
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const body = await json(await chat())

    const system = (streamTextMock.mock.calls[0] as Array<{ system: string }>)[0].system
    expect(system).toContain("## Knowledge Base Context")
    expect(system).toContain("[1] Buku Matematika — Bab 9")

    // Every source, floor skipped, cited flags still reported.
    expect(body.sources.map((s: Record<string, unknown>) => [s.number, s.cited])).toEqual([
      [1, true],
      [2, false],
    ])
    expect(body.grounded).toBe(false)

    const line = logSpy.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("[V1 API] ungrounded:"))
    expect(line).toMatch(/mode=keep/)
    logSpy.mockRestore()
  })
})

// ── 3. relevance floor on sources (issue 4/7) ──────────────────────────────

describe("relevance floor (issue 4/7)", () => {
  const MIXED = [
    { title: "Buku IPA", section: "Bab 3", docId: "doc-1", page: 2, score: 0.9 },
    { title: "Buku Matematika", section: "Bab 9", docId: "doc-2", page: 12, score: 0.2 }, // below the floor
    { title: "Buku IPA", section: "Bab 5", docId: "doc-3", page: 4, score: 0.7 },
  ]

  it("keeps a cited below-threshold source, drops an uncited one, numbers unchanged", async () => {
    retrieveForGroupsMock.mockResolvedValue(routedRetrieval(MIXED))
    // 2026-11-18 brief, task C: the answer cites [2] whose best chunk is
    // below the floor — the live case came back with sources [] and an
    // answer pointing at a card the client could not open. A citation now
    // beats the floor; the uncited [3] is still dropped by it.
    streamTextMock.mockImplementation(() => llmResult(["a [1] b [2]"]))

    const body = await json(await chat())
    expect(body.sources.map((s: Record<string, unknown>) => s.number)).toEqual([1, 2])
    expect(body.sources.map((s: Record<string, unknown>) => s.title)).toEqual(["Buku IPA", "Buku Matematika"])
    expect(body.sources.every((s: Record<string, unknown>) => s.cited)).toBe(true)
  })

  it('sources:"all" returns every floor-passing source with its cited flag', async () => {
    retrieveForGroupsMock.mockResolvedValue(routedRetrieval(MIXED))
    streamTextMock.mockImplementation(() => llmResult(["a [3] b [1]"]))

    const body = await json(await chat({ sources: "all" }))
    expect(body.sources.map((s: Record<string, unknown>) => [s.number, s.cited])).toEqual([
      [1, true],
      [3, true],
    ])
  })

  it("scoreSources maps a source to the best chunk of its own card", () => {
    const sources = [
      { title: "A", section: "s1" },
      { title: "A", section: "s2" },
      { title: "B", section: null },
    ]
    // Two chunks collapse into source "A/s1"; the better one is its score.
    const chunks = [
      { documentTitle: "A", section: "s1", similarity: 0.5 },
      { documentTitle: "A", section: "s1", similarity: 0.8 },
      { documentTitle: "B", section: null, similarity: 0.3 },
    ]
    const scored = scoreSources(sources, chunks, (c) => c.similarity, 0.4)
    expect(scored.map((s) => [s.number, s.bestChunkScore, s.passesFloor])).toEqual([
      [1, 0.8, true],
      [2, null, true], // no chunk matched — kept, not dropped on missing evidence
      [3, 0.3, false],
    ])
  })
})

// ── 4. citation parsing and selection (issue 7) ──────────────────────────────

describe("citedSourceNumbers", () => {
  it("parses [n] and chained [n][m] in first-appearance order", () => {
    expect(citedSourceNumbers("a [1] b [3][2]")).toEqual([1, 3, 2])
  })

  it("counts an embedded [figure:N] as citing source N (same numbering)", () => {
    expect(citedSourceNumbers("lihat [figure:2] lalu [1]")).toEqual([2, 1])
    expect(citedSourceNumbers("[figure: 3]")).toEqual([3])
  })
})

describe("selectResponseSources", () => {
  const scored = (over: Partial<ScoredSource> = {}): ScoredSource => ({
    title: "Buku",
    section: null,
    number: 1,
    bestChunkScore: 0.5,
    passesFloor: true,
    ...over,
  })
  const THREE = [
    scored({ number: 1, bestChunkScore: 0.9 }),
    scored({ number: 2, bestChunkScore: 0.5 }),
    scored({ number: 3, bestChunkScore: 0.7 }),
  ]
  const CITED: ScoredSource[] = THREE.map((s) => ({ ...s }))

  it("default returns only cited sources, ordered by number", () => {
    const out = selectResponseSources(CITED, "a [3] b [1][1]", {
      mode: "cited",
      grounded: true,
      ungroundedKeep: false,
    })
    expect(out.map((s) => s.number)).toEqual([1, 3])
    expect(out.every((s) => s.cited)).toBe(true)
    // The internal score fields never ride the wire.
    expect(out[0]).not.toHaveProperty("bestChunkScore")
    expect(out[0]).not.toHaveProperty("passesFloor")
  })

  it('sources:"all" returns every floor-passing source with its cited flag', () => {
    const out = selectResponseSources(CITED, "hanya [2]", {
      mode: "all",
      grounded: true,
      ungroundedKeep: false,
    })
    expect(out.map((s) => [s.number, s.cited])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ])
  })

  it("grounded but nothing cited returns no sources (UAT issue 7); 'all' still lists them", () => {
    // Live case 2026-11-19: "the book does not define …" was scored grounded
    // (0.50) and shipped 4 unrelated, uncited sources.
    const out = selectResponseSources(CITED, "tidak ada kutipan", {
      mode: "cited",
      grounded: true,
      ungroundedKeep: false,
    })
    expect(out).toEqual([])
    const all = selectResponseSources(CITED, "tidak ada kutipan", { mode: "all", grounded: true, ungroundedKeep: false })
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((s) => s.cited === false)).toBe(true)
  })

  it("a citation below the floor is still shown (2026-11-18 brief, task C)", () => {
    // The live case: the answer cited [2], source 2's best chunk scored
    // under the floor, and the response's sources came back empty. A source
    // the answer cites is part of its evidence — the floor only removes
    // UNCITED low scorers.
    const sources = [
      scored({ number: 1, bestChunkScore: 0.2, passesFloor: false }),
      scored({ number: 2, bestChunkScore: 0.9 }),
    ]
    const out = selectResponseSources(sources, "x [1] y", {
      mode: "cited",
      grounded: true,
      ungroundedKeep: false,
    })
    expect(out.map((s) => [s.number, s.cited])).toEqual([[1, true]])
  })

  it("ungrounded keep returns everything, floor skipped", () => {
    const sources = [
      scored({ number: 1, bestChunkScore: 0.1, passesFloor: true }),
      scored({ number: 2, bestChunkScore: 0.2, passesFloor: true }),
    ]
    const out = selectResponseSources(sources, "jawaban", {
      mode: "cited",
      grounded: false,
      ungroundedKeep: true,
    })
    expect(out.map((s) => s.number)).toEqual([1, 2])
  })
})

// ── 5. SSE and JSON carry the same filtered sources ─────────────────────────

describe("SSE and JSON parity", () => {
  it("both carry the filtered sources in the final frame / body", async () => {
    retrieveForGroupsMock.mockResolvedValue(
      routedRetrieval([
        { title: "Buku IPA", section: "Bab 3", docId: "doc-1", page: 2, score: 0.9 },
        { title: "Buku Sejarah", section: "Bab 1", docId: "doc-2", page: 5, score: 0.2 },
      ]),
    )
    // Two deltas: the stream handler must collect across chunks to see [3].
    streamTextMock.mockImplementation(() => llmResult(["a [1]", " dan lagi [1]"]))

    const jsonBody = await json(await chat())

    const sseRes = await chat({ stream: true })
    const frames = await sseFrames(sseRes)
    const finalFrame = frames.find(
      (f) => f !== "[DONE]" && (f as Record<string, any>).choices?.[0]?.finish_reason,
    ) as Record<string, any>
    expect(finalFrame.sources).toEqual(jsonBody.sources)
    expect(finalFrame.sources.map((s: Record<string, unknown>) => s.number)).toEqual([1])
    expect(finalFrame.grounded).toBe(true)
    expect(finalFrame.retrieval_score).toBe(0.9)
    const text = frames
      .filter((f) => f !== "[DONE]" && (f as Record<string, any>).choices?.[0]?.delta?.content)
      .map((f) => (f as Record<string, any>).choices[0].delta.content)
      .join("")
    expect(text).toBe("a [1] dan lagi [1]")
    expect(frames.at(-1)).toBe("[DONE]")
  })
})

// ── 6. page links (issue 7) ────────────────────────────────────────────────

describe("page_url minting", () => {
  it("stays relative when AGENT_API_PUBLIC_URL is unset", async () => {
    process.env.AGENT_API_LINK_SECRET = "test-secret"
    documentFindMany.mockResolvedValue([
      { id: "doc-1", s3Key: "documents/global/doc-1/buku.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 5_000_000 },
    ])
    retrieveForGroupsMock.mockResolvedValue(
      routedRetrieval([{ title: "Buku IPA", section: "Bab 3", docId: "doc-1", page: 2, score: 0.9 }]),
    )
    streamTextMock.mockImplementation(() => llmResult(["x [1]"]))

    const body = await json(await chat())
    expect(body.sources[0].page_url).toMatch(/^\/api\/v1\/sources\/page\?t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#page=3$/)
  })

  it("mints no page_url for a local original over the size cap", async () => {
    process.env.AGENT_API_LINK_SECRET = "test-secret"
    documentFindMany.mockResolvedValue([
      { id: "doc-1", s3Key: "documents/global/doc-1/buku.pdf", fileType: "pdf", mimeType: "application/pdf", fileSize: 168 * 1024 * 1024 },
    ])
    retrieveForGroupsMock.mockResolvedValue(
      routedRetrieval([{ title: "Buku IPA", section: "Bab 3", docId: "doc-1", page: 2, score: 0.9 }]),
    )
    streamTextMock.mockImplementation(() => llmResult(["x [1]"]))

    const body = await json(await chat())
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0]).not.toHaveProperty("page_url")
  })

  it("emits no page_url without AGENT_API_LINK_SECRET, and looks nothing up", async () => {
    retrieveForGroupsMock.mockResolvedValue(
      routedRetrieval([{ title: "Buku IPA", section: "Bab 3", docId: "doc-1", page: 2, score: 0.9 }]),
    )
    streamTextMock.mockImplementation(() => llmResult(["x [1]"]))

    const body = await json(await chat())
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0]).not.toHaveProperty("page_url")
    expect(documentFindMany).not.toHaveBeenCalled()
  })

  it("mints links for remote-marked sources without any document lookup", async () => {
    process.env.AGENT_API_LINK_SECRET = "test-secret"
    // attachPageUrls is the seam the chat path uses; the old-engine fixtures
    // never carry kbOrigin, so the remote-marked source is built directly.
    const scored: ScoredSource[] = [
      {
        title: "Buku IPA",
        section: "Bab 3",
        documentId: "rdoc-1",
        page: 2,
        number: 1,
        bestChunkScore: 0.9,
        passesFloor: true,
        kbOrigin: "remote",
      },
    ]

    await attachPageUrls(scored, { organizationId: "org-1" })

    // No #page fragment: the route serves exactly the page image.
    expect(scored[0].page_url).toMatch(/^\/api\/v1\/sources\/page\?t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    // Remote sources need no local Document row — nothing was looked up.
    expect(documentFindMany).not.toHaveBeenCalled()
  })

  it("skips local documents with nothing servable (no dead links)", async () => {
    process.env.AGENT_API_LINK_SECRET = "test-secret"
    documentFindMany.mockResolvedValue([
      { id: "doc-md", s3Key: "documents/global/doc-md/notes.md", fileType: "markdown", mimeType: "text/markdown" },
    ])
    retrieveForGroupsMock.mockResolvedValue(
      routedRetrieval([{ title: "Notes", section: "s", docId: "doc-md", page: 0, score: 0.9 }]),
    )
    streamTextMock.mockImplementation(() => llmResult(["x [1]"]))

    const body = await json(await chat())
    expect(body.sources[0]).not.toHaveProperty("page_url")
  })

  it("honours AGENT_API_LINK_TTL_S in the token expiry", () => {
    process.env.AGENT_API_LINK_SECRET = "test-secret"
    process.env.AGENT_API_LINK_TTL_S = "60"
    const now = 1_000_000
    const url = pageUrlForSource(
      { documentId: "rdoc-1", page: 3, kbOrigin: "remote" },
      { organizationId: "org-1", env: process.env, now },
    )
    const token = url!.split("t=")[1]
    const payload = verifyPageToken(token, "test-secret", now)
    expect(payload?.e).toBe(now + 60)
  })
})

describe("GET /api/v1/sources/page", () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
  const NOW = Math.floor(Date.now() / 1000)

  const installFetch = (
    impl: (input: unknown) => Promise<Response>,
  ): { calls: Array<[string, RequestInit]> } => {
    const fn = vi.fn(impl)
    globalThis.fetch = fn as unknown as typeof fetch
    return {
      get calls() {
        return (fn.mock.calls as unknown as Array<[string, RequestInit]>)
      },
    }
  }

  const pageRequest = (token: string | null): Request =>
    new Request(`http://app.test/api/v1/sources/page${token ? `?t=${encodeURIComponent(token)}` : ""}`)

  beforeEach(() => {
    process.env.AGENT_API_LINK_SECRET = "route-secret"
    process.env.KB_REMOTE_URL = "http://kb.test"
    process.env.KB_REMOTE_API_KEY = "kb-key"
    __resetSourcePageCachesForTests()
  })

  it("valid token ⇒ 200 with the page image (positive control)", async () => {
    const fetchSpy = installFetch(async (input) => {
      const url = String(input)
      if (url.includes("/structure")) {
        return new Response(
          JSON.stringify({ pages: [{ number: 2, imageAssetKey: "kb-assets/rdoc-1/pages/p2.jpg" }] }),
          { status: 200 },
        )
      }
      if (url.includes("/assets?")) return new Response(new Uint8Array(PNG), { status: 200 })
      throw new Error(`unexpected fetch: ${url}`)
    })

    const token = mintPageToken({ o: "remote", d: "rdoc-1", p: 2, g: "org-1", e: NOW + 3600 }, "route-secret")
    const res = await sourcePageRoute(pageRequest(token))

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600")
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true)
    expect(fetchSpy.calls.map(([url]) => url)).toEqual([
      "http://kb.test/v1/documents/rdoc-1/structure",
      "http://kb.test/v1/documents/rdoc-1/assets?key=kb-assets%2Frdoc-1%2Fpages%2Fp2.jpg",
    ])
  })

  it("serves a local document's original PDF as application/pdf", async () => {
    documentFindUnique.mockResolvedValue({
      s3Key: "documents/org-1/doc-1/buku-ipa.pdf",
      fileType: "pdf",
      mimeType: "application/pdf",
      fileSize: 5_000_000,
    })
    const token = mintPageToken({ o: "local", d: "doc-1", p: 2, g: "org-1", e: NOW + 3600 }, "route-secret")
    const res = await resolveSourcePage(token, process.env, {
      downloadFile: async () => Buffer.from("%PDF-1.4 buku"),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(await res.text()).toBe("%PDF-1.4 buku")
  })

  it("answers 404 for a local original over the size cap, without downloading it", async () => {
    // A 168 MB textbook would be buffered whole in the app process on every
    // click; the cap (AGENT_API_LINK_LOCAL_MAX_BYTES, default 30 MB) refuses it.
    documentFindUnique.mockResolvedValue({
      s3Key: "documents/org-1/doc-big/buku.pdf",
      fileType: "pdf",
      mimeType: "application/pdf",
      fileSize: 168 * 1024 * 1024,
    })
    let downloaded = false
    const token = mintPageToken({ o: "local", d: "doc-big", p: 2, g: "org-1", e: NOW + 3600 }, "route-secret")
    const res = await resolveSourcePage(token, process.env, {
      downloadFile: async () => {
        downloaded = true
        return Buffer.from("%PDF-1.4")
      },
    })
    expect(res.status).toBe(404)
    expect(downloaded).toBe(false)
  })

  it("answers 404 for a local document with nothing servable", async () => {
    documentFindUnique.mockResolvedValue({ s3Key: "documents/x/notes.md", fileType: "markdown", mimeType: "text/markdown" })
    const token = mintPageToken({ o: "local", d: "doc-md", p: 0, g: "org-1", e: NOW + 3600 }, "route-secret")
    const res = await resolveSourcePage(token, process.env, { downloadFile: async () => Buffer.from("x") })
    expect(res.status).toBe(404)
  })

  it("tampered payload ⇒ 403", async () => {
    const token = mintPageToken({ o: "remote", d: "rdoc-1", p: 2, g: "org-1", e: NOW + 3600 }, "route-secret")
    // Change the page inside the payload, keep the old signature.
    const [segment, sig] = token.split(".")
    const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"))
    payload.p = 99
    const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`

    const res = await sourcePageRoute(pageRequest(tampered))
    expect(res.status).toBe(403)
  })

  it("tampered signature ⇒ 403", async () => {
    const token = mintPageToken({ o: "remote", d: "rdoc-1", p: 2, g: "org-1", e: NOW + 3600 }, "route-secret")
    const [segment, sig] = token.split(".")
    const flipped = sig.slice(0, -2) + (sig.endsWith("AA") ? "BB" : "AA")

    const res = await sourcePageRoute(pageRequest(`${segment}.${flipped}`))
    expect(res.status).toBe(403)
  })

  it("expired ⇒ 403", async () => {
    const token = mintPageToken({ o: "remote", d: "rdoc-1", p: 2, g: "org-1", e: NOW - 60 }, "route-secret")
    const res = await sourcePageRoute(pageRequest(token))
    expect(res.status).toBe(403)
  })

  it("malformed or missing token ⇒ 403", async () => {
    expect((await sourcePageRoute(pageRequest("not-a-token"))).status).toBe(403)
    expect((await sourcePageRoute(pageRequest(null))).status).toBe(403)
  })

  it("no secret ⇒ 404, even for a token signed with something else", async () => {
    delete process.env.AGENT_API_LINK_SECRET
    const token = mintPageToken({ o: "remote", d: "rdoc-1", p: 2, g: "org-1", e: NOW + 3600 }, "route-secret")
    const res = await sourcePageRoute(pageRequest(token))
    expect(res.status).toBe(404)
  })

  it("caches the remote structure per document (~10 min)", async () => {
    let structureCalls = 0
    installFetch(async (input) => {
      const url = String(input)
      if (url.includes("/structure")) {
        structureCalls++
        return new Response(JSON.stringify({ pages: [{ number: 2, imageAssetKey: "kb-assets/rdoc-1/pages/p2.jpg" }] }))
      }
      return new Response(new Uint8Array(PNG))
    })
    const token = mintPageToken({ o: "remote", d: "rdoc-1", p: 2, g: "org-1", e: NOW + 3600 }, "route-secret")

    expect((await sourcePageRoute(pageRequest(token))).status).toBe(200)
    expect((await sourcePageRoute(pageRequest(token))).status).toBe(200)
    expect(structureCalls).toBe(1)
  })
})

// ── 7. the ungrounded refusal also reaches the SSE stream ───────────────────

describe("ungrounded SSE (issue 3, streaming shape)", () => {
  it("streams the refusal with sources [] in the final frame", async () => {
    retrieveForGroupsMock.mockResolvedValue(
      routedRetrieval([{ title: "Buku Matematika", section: "Bab 9", docId: "doc-9", page: 12, score: 0.22 }]),
    )
    streamTextMock.mockImplementation(() => llmResult(["Maaf, tidak tersedia."]))
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const frames = await sseFrames(await chat({ stream: true }))
    const finalFrame = frames.find(
      (f) => f !== "[DONE]" && (f as Record<string, any>).choices?.[0]?.finish_reason,
    ) as Record<string, any>
    expect(finalFrame.sources).toEqual([])
    expect(finalFrame.grounded).toBe(false)
    logSpy.mockRestore()
  })
})
