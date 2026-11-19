/**
 * Unit tests for routing UGM chat + Latihan retrieval to rantai-kb, per
 * knowledge base, with the old engine as the always-working fallback.
 *
 * The invariants that would hurt a live migration if they broke silently:
 *  - an unswitched (or mixed) request must behave exactly as today — old
 *    engine, remote never contacted;
 *  - a switched request must map the remote answer into the old engine's
 *    shapes (grounding, citations, inline figures and passages read them);
 *  - a remote failure must fall back to the old engine, never answer empty;
 *  - flipping a route must need no restart — the routes file is re-read on
 *    mtime change, and a bad edit keeps the last good table.
 *
 * fetch and the old smartHybridRetrieve are mocked; nothing here touches a
 * network or a database. Runs under both `bun test` and vitest.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest"
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// The old engine, substituted for the real in-process one (which needs
// SurrealDB + an embedding provider). The factory closes over `oldEngine`,
// assigned in beforeEach, so it is only read when the wrapper actually calls.
// Typed structurally (not as vitest's Mock) so it compiles against both
// vitest's and bun's vi.fn typings.
interface OldEngineMock {
  (query: string, options?: Record<string, unknown>): Promise<HybridRetrievalResult>
  mock: { calls: Array<[string, Record<string, unknown>?]> }
}
let oldEngine: OldEngineMock | null = null

vi.mock("@/lib/rag", () => ({
  smartHybridRetrieve: vi.fn((query: string, options?: Record<string, unknown>) => {
    if (!oldEngine) throw new Error("old engine mock not initialised")
    return oldEngine(query, options)
  }),
  // The other exports service.ts binds; later test files under `bun test`'s
  // shared module registry import them, so the mock must provide them too.
  smartRetrieve: vi.fn(),
  formatContextForPrompt: vi.fn((r: { context: string }) => r.context),
  formatHybridContextForPrompt: vi.fn((r: { context: string }) => r.context),
}))

import type { HybridRetrievalResult } from "@/lib/rag/retriever"
import { remoteKbConfig, resolveRemoteRoute, __resetRemoteRouteCacheForTests } from "@/lib/kb-client/routing"
import { remoteAssetDownload } from "@/lib/kb-client/remote-hybrid"
import { retrieveForGroups } from "@/features/agent-api/kb-retrieval"
import {
  figureDownloadForRemote,
  loadInlineFigure,
  type FigureSourceLike,
} from "@/features/agent-api/inline-figures"

// ─── fixtures ────────────────────────────────────────────────────────────────

/** What smartHybridRetrieve returns today, in the shape both call sites read. */
function oldEngineResult(): HybridRetrievalResult {
  return {
    context: "[1] Buku Lokal — Bab 1\n\nchunk dari mesin lama",
    sources: [
      {
        documentId: "doc-local",
        documentTitle: "Buku Lokal",
        section: "Bab 1",
        assetKey: null,
        page: 0,
        pages: [0],
        chunkType: null,
        chunkIndex: 3,
        anchorChunkIndex: null,
      },
    ],
    results: [
      {
        chunkId: "chunk-local-1",
        documentId: "doc-local",
        content: "chunk dari mesin lama",
        chunkIndex: 3,
        documentTitle: "Buku Lokal",
        section: "Bab 1",
        assetKey: null,
        page: 0,
        chunkType: null,
        anchorChunkIndex: null,
        figureSelected: false,
        vectorScore: 0.66,
        entityScore: 0,
        graphScore: 0,
        combinedScore: 0.5,
        rank: 1,
        contextualPrefix: null,
        relatedEntities: [],
      },
    ],
    stats: {
      totalTimeMs: 5,
      embeddingTimeMs: 1,
      vectorSearchTimeMs: 2,
      entitySearchTimeMs: 0,
      graphSearchTimeMs: 0,
      fusionTimeMs: 1,
      vectorResults: 1,
      entityResults: 0,
      graphResults: 0,
      totalResults: 1,
    },
  }
}

/** A rantai-kb SearchResponseDto (only the fields the mapping reads). */
function remoteSearchResponse(over: { degrades?: string[] } = {}) {
  return {
    context:
      "[1] Buku IPA — Bab 3\n\nEnergi adalah kemampuan melakukan usaha.\n\n---\n\n[2] Buku IPA — Gambar 3.1\n\n[Gambar] kincir angin",
    degrades: over.degrades ?? [],
    chunks: [
      {
        id: "rchunk-1",
        content: "Energi adalah kemampuan melakukan usaha.",
        documentId: "rdoc-1",
        documentTitle: "Buku IPA",
        categories: ["ipa"],
        section: "Bab 3",
        page: 2, // 0-based in rantai-kb — as in the old engine
        chunkType: "text",
        assetKey: null,
        contextualPrefix: "Bab 3 membahas energi.",
        similarity: 0.87,
        retrieval: { arms: ["dense", "sparse"], fusedScore: 0.031 },
      },
      {
        id: "rchunk-2",
        content: "[Gambar] kincir angin",
        documentId: "rdoc-1",
        documentTitle: "Buku IPA",
        categories: ["ipa"],
        section: "Gambar 3.1",
        page: 2,
        chunkType: "figure",
        assetKey: "kb-assets/rdoc-1/figures/fig-p2-1.png",
        contextualPrefix: null,
        similarity: 0.71,
        retrieval: { arms: ["figure"], fusedScore: 0.02 },
      },
    ],
    sources: [
      { documentId: "rdoc-1", documentTitle: "Buku IPA", section: "Bab 3", page: 2, chunkType: "text", assetKey: null },
      {
        documentId: "rdoc-1",
        documentTitle: "Buku IPA",
        section: "Gambar 3.1",
        page: 2,
        chunkType: "figure",
        assetKey: "kb-assets/rdoc-1/figures/fig-p2-1.png",
      },
    ],
    stats: {
      totalTimeMs: 21,
      embeddingTimeMs: 4,
      vectorSearchTimeMs: 7,
      entitySearchTimeMs: 0,
      graphSearchTimeMs: 0,
      fusionTimeMs: 2,
      vectorResults: 2,
      entityResults: 0,
      graphResults: 0,
      totalResults: 2,
    },
  }
}

// ─── environment / routes-file plumbing ──────────────────────────────────────

const ENV_KEYS = [
  "KB_REMOTE_URL",
  "KB_REMOTE_API_KEY",
  "KB_REMOTE_TIMEOUT_MS",
  "KB_REMOTE_ROUTES_FILE",
  "AGENT_API_GROUNDED_MIN_SCORE",
] as const
const savedEnv: Record<string, string | undefined> = {}
let realFetch: typeof fetch

const routesDir = mkdtempSync(join(existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir(), "kb-routes-"))
let fileSeq = 0

/** Write a routes file and give it a deterministic, distinct mtime. */
function writeRoutesFile(content: unknown, mtime: Date): string {
  const file = join(routesDir, `routes-${++fileSeq}.json`)
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content))
  utimesSync(file, mtime, mtime)
  return file
}

/** Distinct, increasing mtimes so "changed mtime ⇒ re-read" is deterministic. */
const MTIME = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n))

/** Install a fetch mock and return it for call assertions. */
function mockFetch(
  impl: (input: string | RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(impl)
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
  process.env.KB_REMOTE_URL = "http://kb.test"
  process.env.KB_REMOTE_API_KEY = "kb-test-key"
  delete process.env.KB_REMOTE_TIMEOUT_MS
  delete process.env.KB_REMOTE_ROUTES_FILE // each test opts in to a routes file
  delete process.env.AGENT_API_GROUNDED_MIN_SCORE // default threshold 0.4

  realFetch = globalThis.fetch
  oldEngine = vi.fn(async () => oldEngineResult()) as unknown as OldEngineMock

  __resetRemoteRouteCacheForTests()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  globalThis.fetch = realFetch
  __resetRemoteRouteCacheForTests()
})

afterAll(() => {
  rmSync(routesDir, { recursive: true, force: true })
})

// ─── 1. no routes file ⇒ the old path still works ────────────────────────────

describe("retrieveForGroups without a routes file (positive control)", () => {
  it("calls the old engine exactly as today and never contacts the remote", async () => {
    const fetchFn = mockFetch(async () => {
      throw new Error("network must not be hit when no route table is configured")
    })

    const { result, groundedMinScore } = await retrieveForGroups("apa itu energi", {
      groupIds: ["grp-ipa"],
      organizationId: "org-1",
    })

    expect(result.context).toBe(oldEngineResult().context)
    expect(result.results[0]?.vectorScore).toBe(0.66)
    expect(groundedMinScore).toBe(0.4) // the deployment default
    expect(fetchFn.mock.calls.length).toBe(0)

    expect(oldEngine?.mock.calls.length).toBe(1)
    const [query, options] = oldEngine?.mock.calls[0] as [string, { groupIds?: string[]; organizationId?: string }]
    expect(query).toBe("apa itu energi")
    expect(options.groupIds).toEqual(["grp-ipa"])
    expect(options.organizationId).toBe("org-1")
  })

  it("routes nowhere when the remote endpoint is unconfigured", async () => {
    delete process.env.KB_REMOTE_API_KEY
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    const fetchFn = mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse())))

    const { result } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })

    expect(result.context).toBe(oldEngineResult().context)
    expect(fetchFn.mock.calls.length).toBe(0)
  })
})

describe("remoteKbConfig", () => {
  it("is off without either variable, and defaults to an 8 s timeout", () => {
    expect(remoteKbConfig({})).toBeNull()
    expect(remoteKbConfig({ KB_REMOTE_URL: "http://x" })).toBeNull()
    expect(remoteKbConfig({ KB_REMOTE_API_KEY: "k" })).toBeNull()
    expect(remoteKbConfig({ KB_REMOTE_URL: "http://x/", KB_REMOTE_API_KEY: "k" })).toEqual({
      baseUrl: "http://x",
      apiKey: "k",
      timeoutMs: 8_000,
    })
    expect(
      remoteKbConfig({ KB_REMOTE_URL: "http://x", KB_REMOTE_API_KEY: "k", KB_REMOTE_TIMEOUT_MS: "250" })?.timeoutMs,
    ).toBe(250)
  })
})

// ─── 2. fully routed ⇒ remote, mapped into the old shapes ───────────────────

describe("retrieveForGroups with every groupId routed and enabled", () => {
  it("searches the mapped remote KB ids and maps the answer into the old shape", async () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      {
        version: 1,
        routes: {
          "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true },
          "grp-ips": { remoteKbId: "kb-remote-2", enabled: true },
        },
        groundedMinScore: 0.55,
      },
      MTIME(1),
    )
    const fetchFn = mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse()), { status: 200 }))

    const { result, groundedMinScore } = await retrieveForGroups("apa itu energi", {
      groupIds: ["grp-ipa", "grp-ips"],
      organizationId: "org-1",
    })

    // The request: POST /v1/search with the mapped ids, authenticated.
    expect(fetchFn.mock.calls.length).toBe(1)
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toBe("http://kb.test/v1/search")
    expect(init.method).toBe("POST")
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer kb-test-key")
    expect(JSON.parse(String(init.body))).toEqual({
      query: "apa itu energi",
      knowledgeBaseIds: ["kb-remote-1", "kb-remote-2"],
    })

    // The old engine was not consulted.
    expect(oldEngine?.mock.calls.length).toBe(0)

    // vectorScore is filled from the chunk's similarity (the remote response's
    // one per-chunk score).
    expect(result.results[0]?.vectorScore).toBe(0.87)
    expect(result.results[1]?.vectorScore).toBe(0.71)

    // Page numbering: rantai-kb is 0-based and so is the old engine
    // (extractors/types.ts: "0-based page index"; the dashboard renders
    // page + 1 as "hal. N"), so pages pass through unchanged — 2 stays 2.
    expect(result.results[0]?.page).toBe(2)
    expect(result.sources[0]?.page).toBe(2)
    expect(result.sources[0]?.pages).toEqual([2])

    // The old shape end to end: what grounding, citations, inline figures and
    // passages read.
    expect(Object.keys(result.results[0] ?? {})).toEqual(
      expect.arrayContaining([
        "chunkId",
        "documentId",
        "content",
        "chunkIndex",
        "vectorScore",
        "entityScore",
        "graphScore",
        "combinedScore",
        "rank",
        "relatedEntities",
      ]),
    )
    expect(Object.keys(result.sources[0] ?? {})).toEqual(
      expect.arrayContaining(["documentId", "documentTitle", "section", "assetKey", "page", "chunkType"]),
    )
    expect(result.context).toBe(remoteSearchResponse().context)
    expect(result.stats.totalTimeMs).toBe(21)
    expect(result.results[1]?.figureSelected).toBe(true) // retrieval.arms had "figure"
    expect(result.results[0]?.figureSelected).toBe(false)
    expect(result.sources[0]?.kbOrigin).toBe("remote") // the figure loader's marker

    // The route's grounding threshold, not the default.
    expect(groundedMinScore).toBe(0.55)
  })

  it("deduplicates group ids that map to the same remote KB", () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      {
        version: 1,
        routes: {
          "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true },
          "grp-ips": { remoteKbId: "kb-remote-1", enabled: true },
        },
      },
      MTIME(1),
    )
    expect(resolveRemoteRoute(["grp-ipa", "grp-ips"])).toEqual({ remoteKbIds: ["kb-remote-1"] })
  })

  it("logs one request line, with degrades when an arm failed", async () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse({ degrades: ["sparse"] }))))
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })

    const line = logSpy.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("engine=remote"))
    expect(line).toBeDefined()
    expect(line).toContain("kb=kb-remote-1")
    expect(line).toContain("chunks=2")
    expect(line).toContain("degrades=sparse")
    logSpy.mockRestore()
  })
})

// ─── 3. not fully routed ⇒ the old engine ────────────────────────────────────

describe("requests that must stay on the old engine", () => {
  it("uses the old engine when one groupId has no route", async () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    const fetchFn = mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse())))

    const { result } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa", "grp-unrouted"] })

    expect(result.context).toBe(oldEngineResult().context) // never a mix of two engines
    expect(fetchFn.mock.calls.length).toBe(0)
    expect(oldEngine?.mock.calls.length).toBe(1)
  })

  it("uses the old engine when a route is enabled:false", async () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: false } } },
      MTIME(1),
    )
    const fetchFn = mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse())))

    const { result } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })

    expect(result.context).toBe(oldEngineResult().context)
    expect(fetchFn.mock.calls.length).toBe(0)
  })

  it("resolves no route for no groups, a disabled route, or a partial match", () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true }, "grp-off": { remoteKbId: "kb-remote-2", enabled: false } } },
      MTIME(1),
    )
    expect(resolveRemoteRoute(undefined)).toBeNull()
    expect(resolveRemoteRoute([])).toBeNull()
    expect(resolveRemoteRoute(["grp-off"])).toBeNull()
    expect(resolveRemoteRoute(["grp-ipa", "grp-off"])).toBeNull()
    expect(resolveRemoteRoute(["grp-ipa"])).toEqual({ remoteKbIds: ["kb-remote-1"] })
  })
})

// ─── 4. remote failure ⇒ the old engine answers ─────────────────────────────

describe("remote failures fall back to the old engine", () => {
  it("returns the old engine's result on a 500", async () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    const fetchFn = mockFetch(async () => new Response("boom", { status: 500 }))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { result, groundedMinScore } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })

    expect(result.context).toBe(oldEngineResult().context)
    expect(result.results[0]?.vectorScore).toBe(0.66)
    expect(groundedMinScore).toBe(0.4) // fallback keeps the default threshold
    expect(fetchFn.mock.calls.length).toBe(1) // the remote was tried
    expect(oldEngine?.mock.calls.length).toBe(1)
    expect(
      warnSpy.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("[kb-route] fallback:")),
    ).toContain("500")
    warnSpy.mockRestore()
  })

  it("returns the old engine's result on a timeout", async () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    process.env.KB_REMOTE_TIMEOUT_MS = "40" // fail fast
    // A fetch that hangs until the request is aborted — what a slow service
    // looks like from here.
    const fetchFn = mockFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted in test")))
        }),
    )
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { result } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })

    expect(result.context).toBe(oldEngineResult().context)
    expect(fetchFn.mock.calls.length).toBe(1)
    expect(oldEngine?.mock.calls.length).toBe(1)
    expect(warnSpy.mock.calls.map((c) => c.join(" ")).some((l) => l.includes("[kb-route] fallback:"))).toBe(true)
    warnSpy.mockRestore()
  })
})

// ─── 5. editing the routes file takes effect without a restart ───────────────

describe("the routes file is re-read when its mtime changes", () => {
  it("picks up enabled true → false on the next call after the stat window, in-process", async () => {
    const file = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    process.env.KB_REMOTE_ROUTES_FILE = file
    const fetchFn = mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse())))

    // Call 1: routed, remote serves it.
    await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })
    expect(fetchFn.mock.calls.length).toBe(1)
    expect(oldEngine?.mock.calls.length).toBe(0)

    // The operator flips the route off (new mtime)…
    writeFileSync(file, JSON.stringify({ version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: false } } }))
    utimesSync(file, MTIME(2), MTIME(2))

    // …the very next call still uses the cached table: the file is statted at
    // most once per ~5 s, so a flip lands within that window, not instantly.
    await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })
    expect(fetchFn.mock.calls.length).toBe(2)
    expect(oldEngine?.mock.calls.length).toBe(0)

    // After the stat window passes (the clock advance stands in for the wait),
    // the same process — no restart, no reset — sees the new mtime and flips
    // to the old engine.
    const clock = vi.spyOn(Date, "now")
    const realNow = Date.now()
    clock.mockReturnValue(realNow + 6_000)
    try {
      const { result } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })
      expect(result.context).toBe(oldEngineResult().context)
      expect(fetchFn.mock.calls.length).toBe(2) // no third remote call
      expect(oldEngine?.mock.calls.length).toBe(1)
    } finally {
      clock.mockRestore()
    }
  })
})

// ─── 6. a bad edit keeps the last good table ─────────────────────────────────

describe("invalid routes files", () => {
  it("keeps the last good table in force", async () => {
    const file = writeRoutesFile(
      { version: 1, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    process.env.KB_REMOTE_ROUTES_FILE = file
    const fetchFn = mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse())))

    await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })
    expect(fetchFn.mock.calls.length).toBe(1)

    // A half-edited file: not JSON. The operator's rollback (enabled:false)
    // never landed, so the last good table keeps serving.
    writeFileSync(file, "{ not json")
    utimesSync(file, MTIME(2), MTIME(2))

    const clock = vi.spyOn(Date, "now")
    clock.mockReturnValue(Date.now() + 6_000)
    try {
      const { result } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })
      expect(result.context).toBe(remoteSearchResponse().context) // still remote
      expect(fetchFn.mock.calls.length).toBe(2)
      expect(oldEngine?.mock.calls.length).toBe(0)
    } finally {
      clock.mockRestore()
    }
  })

  it("routes nowhere when the first read is already invalid (no last good)", async () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile("{ not json", MTIME(1))
    const fetchFn = mockFetch(async () => new Response(JSON.stringify(remoteSearchResponse())))

    const { result } = await retrieveForGroups("apa itu energi", { groupIds: ["grp-ipa"] })

    expect(result.context).toBe(oldEngineResult().context)
    expect(fetchFn.mock.calls.length).toBe(0)
  })

  it("rejects a table that is not version 1", () => {
    process.env.KB_REMOTE_ROUTES_FILE = writeRoutesFile(
      { version: 2, routes: { "grp-ipa": { remoteKbId: "kb-remote-1", enabled: true } } },
      MTIME(1),
    )
    expect(resolveRemoteRoute(["grp-ipa"])).toBeNull()
  })
})

// ─── 7. inline figures from the remote engine ────────────────────────────────

describe("inline figures across engines", () => {
  const fakeEncode = async (buffer: Buffer) => ({ mime: "image/png", width: 2, height: 2, buffer })

  it("downloads a remote figure from the assets route with the API key", async () => {
    const fetchFn = mockFetch(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))

    const bytes = await remoteAssetDownload("rdoc-1", "kb-assets/rdoc-1/figures/fig-p2-1.png")

    expect(Array.from(bytes)).toEqual([1, 2, 3])
    expect(fetchFn.mock.calls.length).toBe(1)
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toBe(
      "http://kb.test/v1/documents/rdoc-1/assets?key=kb-assets%2Frdoc-1%2Ffigures%2Ffig-p2-1.png",
    )
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer kb-test-key")
  })

  it("refuses a remote asset key that does not belong to the document", async () => {
    const download = vi.fn(async () => Buffer.from([9]))
    const sources: FigureSourceLike[] = [
      {
        title: "Buku IPA",
        section: "Gambar 3.1",
        documentId: "rdoc-1",
        assetKey: "kb-assets/rdoc-someone-else/figures/fig.png",
        page: 2,
        chunkType: "figure",
        kbOrigin: "remote",
      },
    ]

    expect(await loadInlineFigure(1, sources, { download, encode: fakeEncode })).toBeNull()
    expect(download.mock.calls.length).toBe(0)
  })

  it("fetches remote-marked figures from rantai-kb and local ones from S3", async () => {
    const fetchFn = mockFetch(async () => new Response(new Uint8Array([5, 6]), { status: 200 }))
    const localDownload = vi.fn(async (_assetKey: string) => Buffer.from([7]))
    const download = figureDownloadForRemote(localDownload, remoteAssetDownload)

    const sources: FigureSourceLike[] = [
      {
        title: "Buku IPA",
        section: "Gambar 3.1",
        documentId: "rdoc-1",
        assetKey: "kb-assets/rdoc-1/figures/fig-p2-1.png",
        page: 2,
        chunkType: "figure",
        kbOrigin: "remote",
      },
      {
        title: "Buku Lokal",
        section: "Bab 1",
        documentId: "doc-l",
        assetKey: "documents/org-1/doc-l/assets/fig-p0-1.png",
        page: 0,
        chunkType: "figure",
      },
    ]

    const remoteFigure = await loadInlineFigure(1, sources, { download, encode: fakeEncode })
    expect(remoteFigure?.data).toBe(Buffer.from([5, 6]).toString("base64"))
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain("/v1/documents/rdoc-1/assets?key=")
    expect(localDownload.mock.calls.length).toBe(0)

    const localFigure = await loadInlineFigure(2, sources, { download, encode: fakeEncode })
    expect(localFigure?.data).toBe(Buffer.from([7]).toString("base64"))
    expect(fetchFn.mock.calls.length).toBe(1) // the local figure never hit the remote
    expect(localDownload.mock.calls[0]?.[0]).toBe("documents/org-1/doc-l/assets/fig-p0-1.png")  })
})
