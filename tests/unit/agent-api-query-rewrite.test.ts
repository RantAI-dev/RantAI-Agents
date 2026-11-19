/**
 * Unit tests for the follow-up query rewrite on the v1 chat path
 * (2026-11-18 brief, task B).
 *
 * What must hold:
 *  - a follow-up with history is rewritten by the base model, and ONLY
 *    retrieval sees the rewrite — the answering model still gets the
 *    conversation verbatim;
 *  - first turns and AGENT_API_QUERY_REWRITE=off never call the model;
 *  - any failure, timeout, empty or overlong reply searches the ORIGINAL
 *    last message (not the anchor — that stays the no-model fallback for
 *    while the rewrite is off);
 *  - the log line carries the decision, never the question.
 *
 * streamText/generateText (the "ai" SDK), the provider, retrieval and
 * prisma are mocked; nothing here touches a network or a database. The
 * kb-retrieval mock is a fixture-or-pass-through, for the same reason as in
 * agent-api-uat-chat: bun's vi.mock registry is process-global, so the
 * stub must fall back to the real routing layer for files that load later
 * (kb-remote-routing exercises it).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── module mocks ─────────────────────────────────────────────────────────────

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
const generateTextMock = vi.fn()
vi.mock("ai", () => ({
  streamText: (...a: unknown[]) => streamTextMock(...a),
  convertToModelMessages: async (
    uiMessages: Array<{ role: string; parts: Array<{ type: string; text: string }> }>,
  ) => uiMessages.map((m) => ({ role: m.role, content: m.parts.map((p) => ({ type: "text", text: p.text })) })),
  stepCountIs: (n: number) => ({ stepCountIs: n }),
  // Only the query rewrite calls generateText on this path.
  generateText: (...a: unknown[]) => generateTextMock(...a),
}))

vi.mock("@/lib/llm/provider", () => ({
  getChatProvider: () => (id: string) => ({ mockProvider: true, id }),
  resolveModelId: (id: string) => id,
}))

vi.mock("@/lib/llm/provider-registry", () => ({
  ensureProviderRegistryLoaded: async () => {},
  getPlatformDefaultModel: (id: string) => id,
  getProviderRegistry: () => ({ models: [], providers: {} }),
}))

vi.mock("@/lib/models", () => ({
  DEFAULT_MODEL_ID: "mock-model",
  isValidModelAsync: async () => true,
  getModelByIdAsync: async () => ({ capabilities: { functionCalling: false, vision: false } }),
}))

vi.mock("@/lib/skills/resolver", () => ({
  resolveSkillsForAssistant: async () => null,
}))

vi.mock("@/features/knowledge/groups/service", () => ({
  listDocumentsInKnowledgeGroups: async () => [],
}))

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
import {
  queryRewriteEnabled,
  queryRewriteTimeoutMs,
  rewriteQueryForRetrieval,
} from "@/features/agent-api/query-rewrite"
import type { HybridRetrievalResult } from "@/lib/rag/retriever"

// ── fixtures ─────────────────────────────────────────────────────────────────

const AUTH = {
  apiKey: { id: "key_rw", assistantId: "asst_rw", scopes: ["chat", "chat:stream"], ipWhitelist: [] },
  assistant: { id: "asst_rw", name: "Tutor Rewrite", emoji: null },
}

const ASSISTANT_ROW = {
  id: "asst_rw",
  name: "Tutor Rewrite",
  systemPrompt: "You are a helpful tutor.",
  model: "mock-model",
  useKnowledgeBase: true,
  knowledgeBaseGroupIds: ["grp_ipa"],
  organizationId: "org-1",
  modelConfig: null,
  guardRails: null,
  memoryConfig: null,
}

/** One strongly-scored source, so the answer path is grounded throughout. */
function routedRetrieval(): { result: HybridRetrievalResult; groundedMinScore: number } {
  const entry = { title: "Buku IPA", section: "Bab 3", docId: "doc-1", page: 2, score: 0.9 }
  const sources = [
    {
      documentId: entry.docId,
      documentTitle: entry.title,
      section: entry.section,
      assetKey: null,
      page: entry.page,
      pages: [entry.page],
      chunkType: null,
      chunkIndex: 1,
      anchorChunkIndex: null,
    },
  ]
  const results = [
    {
      chunkId: "chunk-1",
      documentId: entry.docId,
      content: "isi buku IPA",
      chunkIndex: 0,
      documentTitle: entry.title,
      section: entry.section,
      assetKey: null,
      page: entry.page,
      chunkType: null,
      anchorChunkIndex: null,
      figureSelected: false,
      vectorScore: entry.score,
      entityScore: 0,
      graphScore: 0,
      combinedScore: entry.score,
      rank: 1,
      contextualPrefix: null,
      relatedEntities: [],
      isNeighbor: false,
    },
  ]
  return {
    result: {
      context: "[1] Buku IPA — Bab 3\n\nisi buku IPA\n\nSources:\n1. Buku IPA — Bab 3",
      sources,
      results,
      stats: {
        totalTimeMs: 1, embeddingTimeMs: 1, vectorSearchTimeMs: 1, entitySearchTimeMs: 0,
        graphSearchTimeMs: 0, fusionTimeMs: 0, vectorResults: 1,
        entityResults: 0, graphResults: 0, totalResults: 1,
      },
    },
    groundedMinScore: 0.4,
  }
}

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

type AuthParam = Parameters<typeof runV1ChatCompletion>[0]

const FOLLOW_UP = [
  { role: "user", content: "apa itu suhu dan kalor?" },
  { role: "assistant", content: "Suhu adalah ukuran derajat panas, kalor adalah energi yang berpindah." },
  { role: "user", content: "bandingkan dengan yang tadi" },
]

async function chat(messages: Array<{ role: string; content: string }>): Promise<Response> {
  return runV1ChatCompletion(AUTH as AuthParam, {
    model: "mock-model",
    messages: messages as never,
    stream: false,
    sources: "cited",
  })
}

// ── environment plumbing ────────────────────────────────────────────────────

const ENV_KEYS = [
  "AGENT_API_QUERY_REWRITE",
  "AGENT_API_QUERY_REWRITE_TIMEOUT_MS",
  "AGENT_API_ANCHOR_FIRST_TOPIC",
  "AGENT_API_LINK_SECRET",
  "AGENT_API_UNGROUNDED_CONTEXT",
  "AGENT_API_GROUNDED_MIN_SCORE",
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
  delete process.env.AGENT_API_QUERY_REWRITE
  delete process.env.AGENT_API_QUERY_REWRITE_TIMEOUT_MS
  delete process.env.AGENT_API_ANCHOR_FIRST_TOPIC
  delete process.env.AGENT_API_LINK_SECRET
  delete process.env.AGENT_API_UNGROUNDED_CONTEXT
  delete process.env.AGENT_API_GROUNDED_MIN_SCORE

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
  retrieveForGroupsMock.mockResolvedValue(routedRetrieval())
  streamTextMock.mockReset()
  streamTextMock.mockImplementation(() => llmResult(["Bandingkan suhu dan kalor [1]."]))
  generateTextMock.mockReset()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  // Leave the real routing layer in force for files that load after this one.
  retrieveForGroupsMock.mockReset()
})

// ── env knobs ────────────────────────────────────────────────────────────────

describe("env knobs", () => {
  it("is on unless AGENT_API_QUERY_REWRITE=off (case-insensitive)", () => {
    expect(queryRewriteEnabled({})).toBe(true)
    expect(queryRewriteEnabled({ AGENT_API_QUERY_REWRITE: "off" })).toBe(false)
    expect(queryRewriteEnabled({ AGENT_API_QUERY_REWRITE: " OFF " })).toBe(false)
    expect(queryRewriteEnabled({ AGENT_API_QUERY_REWRITE: "on" })).toBe(true)
  })

  it("timeout defaults to 6 s and reads AGENT_API_QUERY_REWRITE_TIMEOUT_MS", () => {
    expect(queryRewriteTimeoutMs({})).toBe(6000)
    expect(queryRewriteTimeoutMs({ AGENT_API_QUERY_REWRITE_TIMEOUT_MS: "1500" })).toBe(1500)
    expect(queryRewriteTimeoutMs({ AGENT_API_QUERY_REWRITE_TIMEOUT_MS: "not-a-number" })).toBe(6000)
  })
})

// ── the module ──────────────────────────────────────────────────────────────

describe("rewriteQueryForRetrieval", () => {
  it("first turn: no model call, original back", async () => {
    const r = await rewriteQueryForRetrieval(
      [{ role: "user", content: "apa itu suhu?" }],
      "apa itu suhu?",
    )
    expect(r).toEqual({ query: "apa itu suhu?", used: "original", ran: false })
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it("rewrites from the last ~6 messages and asks for one short call", async () => {
    generateTextMock.mockResolvedValue({ text: "perbandingan suhu dan kalor" })
    const r = await rewriteQueryForRetrieval(FOLLOW_UP, "bandingkan dengan yang tadi")

    expect(r).toEqual({ query: "perbandingan suhu dan kalor", used: "rewritten", ran: true })
    const call = generateTextMock.mock.calls[0][0] as Record<string, unknown>
    expect(call.maxRetries).toBe(0)
    expect(call.maxOutputTokens).toBe(64)
    expect((call.model as { id: string }).id).toBe("base")
    // The prompt carries the conversation the reference points at…
    expect(call.prompt).toContain("apa itu suhu dan kalor?")
    expect(call.prompt).toContain("bandingkan dengan yang tadi")
    // …and the timeout knob reaches the call.
    expect(queryRewriteTimeoutMs()).toBe(6000)
  })

  it("a thrown call answers with the original", async () => {
    generateTextMock.mockRejectedValue(new Error("boom"))
    const r = await rewriteQueryForRetrieval(FOLLOW_UP, "bandingkan dengan yang tadi")
    expect(r).toEqual({ query: "bandingkan dengan yang tadi", used: "original", ran: true })
  })

  it("an abort answers with the original", async () => {
    const aborted = new Error("This operation was aborted")
    aborted.name = "AbortError"
    generateTextMock.mockRejectedValue(aborted)
    const r = await rewriteQueryForRetrieval(FOLLOW_UP, "bandingkan dengan yang tadi")
    expect(r).toEqual({ query: "bandingkan dengan yang tadi", used: "original", ran: true })
  })

  it("an empty reply answers with the original", async () => {
    generateTextMock.mockResolvedValue({ text: "  \n " })
    const r = await rewriteQueryForRetrieval(FOLLOW_UP, "bandingkan dengan yang tadi")
    expect(r.used).toBe("original")
  })

  it("an overlong reply answers with the original", async () => {
    generateTextMock.mockResolvedValue({ text: "b".repeat(400) })
    const r = await rewriteQueryForRetrieval(FOLLOW_UP, "bandingkan dengan yang tadi")
    expect(r.used).toBe("original")
  })

  it("strips quotes and keeps the first line only", async () => {
    generateTextMock.mockResolvedValue({ text: '"perbandingan suhu dan kalor"\n(diperjelas)' })
    const r = await rewriteQueryForRetrieval(FOLLOW_UP, "bandingkan dengan yang tadi")
    expect(r.query).toBe("perbandingan suhu dan kalor")
    expect(r.used).toBe("rewritten")
  })

  it("logs the decision without the question text", async () => {
    generateTextMock.mockResolvedValue({ text: "perbandingan suhu dan kalor" })
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    await rewriteQueryForRetrieval(FOLLOW_UP, "bandingkan dengan yang tadi")
    const line = logSpy.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("[V1 API] query rewrite:"))
    expect(line).toMatch(/\[V1 API\] query rewrite: ms=\d+ used=rewritten reason=ok/)
    expect(line).not.toContain("bandingkan")
    logSpy.mockRestore()
  })
})

// ── through the chat path ────────────────────────────────────────────────────

describe("the chat path's retrieval query", () => {
  it("history present → the rewritten query reaches retrieveForGroups; the answering model still sees the original", async () => {
    generateTextMock.mockResolvedValue({ text: "perbandingan suhu dan kalor" })
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const body = (await (await chat(FOLLOW_UP)).json()) as Record<string, any>

    // Retrieval searched for the rewrite…
    expect(retrieveForGroupsMock.mock.calls[0][0]).toBe("perbandingan suhu dan kalor")
    // …and only retrieval did: the answering conversation keeps the raw
    // follow-up as its last user message.
    const answering = (streamTextMock.mock.calls[0] as Array<{ messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> }>)[0]
    const lastUser = [...answering.messages].reverse().find((m) => m.role === "user")
    expect(lastUser?.content.map((p) => p.text).join("")).toBe("bandingkan dengan yang tadi")
    // The decision is logged, question text never.
    const line = logSpy.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("[V1 API] query rewrite:"))
    expect(line).toMatch(/ms=\d+ used=rewritten reason=ok/)
    expect(line).not.toContain("bandingkan")
    // And the answer itself came through normally.
    expect(body.choices[0].message.content).toBe("Bandingkan suhu dan kalor [1].")
    logSpy.mockRestore()
  })

  it("model throws → the original last message is searched", async () => {
    generateTextMock.mockRejectedValue(new Error("boom"))

    await chat(FOLLOW_UP)

    expect(retrieveForGroupsMock.mock.calls[0][0]).toBe("bandingkan dengan yang tadi")
  })

  it("timeout → the original last message is searched", async () => {
    const aborted = new Error("This operation was aborted")
    aborted.name = "AbortError"
    generateTextMock.mockRejectedValue(aborted)

    await chat(FOLLOW_UP)

    expect(retrieveForGroupsMock.mock.calls[0][0]).toBe("bandingkan dengan yang tadi")
  })

  it("first turn → no rewrite model call, the raw question is searched", async () => {
    await chat([{ role: "user", content: "apa itu suhu?" }])

    expect(generateTextMock).not.toHaveBeenCalled()
    expect(retrieveForGroupsMock.mock.calls[0][0]).toBe("apa itu suhu?")
  })

  it("AGENT_API_QUERY_REWRITE=off → no rewrite model call, the raw question is searched", async () => {
    process.env.AGENT_API_QUERY_REWRITE = "off"
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await chat(FOLLOW_UP)

    expect(generateTextMock).not.toHaveBeenCalled()
    expect(retrieveForGroupsMock.mock.calls[0][0]).toBe("bandingkan dengan yang tadi")
    const line = logSpy.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("[V1 API] query rewrite:"))
    expect(line).toMatch(/ms=\d+ used=original reason=off/)
    logSpy.mockRestore()
  })

  it("the anchor stays the no-model fallback while the rewrite is off", async () => {
    process.env.AGENT_API_QUERY_REWRITE = "off"
    process.env.AGENT_API_ANCHOR_FIRST_TOPIC = "true"

    await chat(FOLLOW_UP)

    // The anchor concatenates the conversation's first topic with the short
    // follow-up, with no model call.
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(retrieveForGroupsMock.mock.calls[0][0]).toBe("apa itu suhu dan kalor?\nbandingkan dengan yang tadi")
  })

  it("a rewrite that ran and failed uses the original last message, not the anchor", async () => {
    process.env.AGENT_API_ANCHOR_FIRST_TOPIC = "true"
    generateTextMock.mockRejectedValue(new Error("boom"))

    await chat(FOLLOW_UP)

    expect(retrieveForGroupsMock.mock.calls[0][0]).toBe("bandingkan dengan yang tadi")
  })
})
