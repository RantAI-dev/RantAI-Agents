/**
 * UAT issues 10 and 11 (practice generate): the outcome log line, SSE
 * progress streaming, the label-model circuit breaker, aborting on client
 * disconnect, duplicate refill passage choice, and the 502's details.
 *
 * No network: the adapter client, retrieval, prisma and the AI SDK's
 * generateText are all module-mocked before the service is imported.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { TopicMaterial } from "@/features/agent-api/practice/engine"
import type * as PracticeService from "@/features/agent-api/practice/service"
import type * as PracticeEngine from "@/features/agent-api/practice/engine"
import type * as LabelBreaker from "@/features/agent-api/practice/label-breaker"
import type * as PracticeTypes from "@/features/agent-api/practice/types"

// ---------------------------------------------------------------------------
// Module mocks. bun:test (the runner) also exports `mock` through its
// vitest alias; the module mocking happens in beforeAll, before the module
// under test is imported dynamically, and the mock fns are plain functions
// so the file typechecks under vitest's types too.
// ---------------------------------------------------------------------------

const ENDPOINT = { baseUrl: "http://mock", apiKey: null, model: "practice" }

const PASSAGE_WORDS = "Enzim amilase mengubah amilum menjadi maltosa di dalam mulut."
const passageText = (topic: string, i: number) =>
  `${PASSAGE_WORDS} Bagian khusus nomor ${i} tentang ${topic} menjelaskan proses pencernaan dengan urutan langkah yang jelas dan contoh sehari-hari.`

/** What the adapter mock has been asked so far, for call-count assertions. */
const adapterCalls: Array<{ passage: string; n: number }> = []
let soalCounter = 0
/** Per-test adapter override: return a ChatJsonResult, or undefined for the default reply. */
let adapterOverride: null | ((call: { index: number; n: number; passage: string }) => unknown) = null

const chatJsonMock = async (
  _endpoint: unknown,
  messages: Array<{ role: string; content: string }>,
  opts: { schema?: { properties?: { soal?: { minItems?: number; items?: { properties?: Record<string, unknown> } } } } },
) => {
  const soalSchema = opts.schema?.properties?.soal
  const n = soalSchema?.minItems ?? 1
  const props = soalSchema?.items?.properties ?? {}
  const tipe = "skenario" in props ? "cerita" : ((props.kunci as { minItems?: number })?.minItems ?? 1) === 2 ? "multi" : "tunggal"
  const passage = messages[1]?.content ?? ""
  const index = adapterCalls.length
  adapterCalls.push({ passage, n })
  const over = adapterOverride?.({ index, n, passage })
  if (over !== undefined) return over
  soalCounter++
  const soal = Array.from({ length: n }, (_, i) => ({
    ...(tipe === "cerita" ? { skenario: `Dina memegang benda nomor ${soalCounter}${i}.` } : {}),
    pertanyaan: `Pertanyaan unik latihan nomor ${soalCounter}-${i} tentang proses pencernaan?`,
    opsi: {
      A: "amilase",
      B: tipe === "multi" ? "maltosa" : `pengecoh${soalCounter}${i}a`,
      C: `pengecoh${soalCounter}${i}b`,
      D: `pengecoh${soalCounter}${i}c`,
    },
    kunci: tipe === "multi" ? ["A", "B"] : ["A"],
  }))
  return { ok: true, text: JSON.stringify({ soal }) }
}

const retrieveForGroupsMock = async (query: string) => {
  if (query === "tidak ada di buku") return { result: { results: [] }, groundedMinScore: 0.3 }
  return {
    result: {
      results: [0, 1, 2, 3].map((i) => ({
        chunkType: "text",
        content: passageText(query, i),
        documentTitle: `Buku ${query}`,
        section: "Sistem Pencernaan",
        vectorScore: 0.9,
      })),
    },
    groundedMinScore: 0.3,
  }
}

const prismaMock = {
  assistant: {
    findUnique: async () => ({ organizationId: "org-1", knowledgeBaseGroupIds: ["kb-1", "kb-2"] }),
  },
  knowledgeBaseGroup: {
    findMany: async () => [{ name: "SMP Kelas 8" }, { name: "IPA Kelas 8" }],
  },
}

let generateTextCalls = 0
let generateTextImpl: () => Promise<{ text: string }> = async () => ({ text: '{"materi": []}' })
const generateTextMock = async () => {
  generateTextCalls++
  return generateTextImpl()
}

/** True only while this file runs; see the kb-retrieval mock in beforeAll. */
let kbRetrievalMockActive = false

// Filled by beforeAll, after the mocks are in place.
let runPracticeGenerate: typeof PracticeService.runPracticeGenerate
let buildPracticeSet: typeof PracticeEngine.buildPracticeSet
let _resetLabelBreaker: typeof LabelBreaker._resetLabelBreaker
let _setLabelBreakerClock: typeof LabelBreaker._setLabelBreakerClock
let LABEL_BREAKER_MS: typeof LabelBreaker.LABEL_BREAKER_MS
let PracticeGenerateSchema: typeof PracticeTypes.PracticeGenerateSchema

beforeAll(async () => {
  // Under bun test the "vitest" import is aliased to bun:test, whose `mock`
  // carries module mocking; cast because vitest's own types do not export it.
  const { mock } = (await import("vitest")) as unknown as {
    mock: { module: (specifier: string, factory: () => unknown) => void }
  }
  // The real AI SDK module links fine (the chat path imports many of its
  // exports); only generateText is replaced, so every other named export the
  // import graph needs is the genuine one.
  const realAi = await import("ai")

  mock.module("@/features/agent-api/practice/client", () => ({
    chatJson: chatJsonMock,
    resolveEndpoint: async () => ENDPOINT,
  }))
  // bun's module registry is process-global and mock.module cannot be undone,
  // so this registration outlives the file and would replace kb-retrieval for
  // every test file that loads after it (kb-remote-routing.test.ts went red).
  // While this file runs the mock answers; afterwards it passes through to the
  // real module, loaded under a query-busted specifier the mock does not cover.
  // A variable specifier: tsc cannot resolve the "?real" query form.
  const realSpecifier: string = "../../src/features/agent-api/kb-retrieval.ts?real=practice-uat"
  const realKbRetrieval = (await import(realSpecifier)) as typeof import("@/features/agent-api/kb-retrieval")
  mock.module("@/features/agent-api/kb-retrieval", () => ({
    ...realKbRetrieval,
    retrieveForGroups: (...args: Parameters<typeof realKbRetrieval.retrieveForGroups>) =>
      kbRetrievalMockActive ? retrieveForGroupsMock(args[0]) : realKbRetrieval.retrieveForGroups(...args),
  }))
  kbRetrievalMockActive = true
  mock.module("@/lib/prisma", () => ({ prisma: prismaMock }))
  // The labelling path builds its model through the provider helper first;
  // mocked so a label-model test never depends on provider env or keys.
  mock.module("@/lib/llm/provider", () => ({
    getChatProvider: () => (modelId: string) => ({ modelId }),
    resolveModelId: (id: string) => id,
  }))
  mock.module("ai", () => ({ ...realAi, generateText: generateTextMock }))

  ;({ runPracticeGenerate } = await import("@/features/agent-api/practice/service"))
  ;({ buildPracticeSet } = await import("@/features/agent-api/practice/engine"))
  ;({ _resetLabelBreaker, _setLabelBreakerClock, LABEL_BREAKER_MS } = await import("@/features/agent-api/practice/label-breaker"))
  ;({ PracticeGenerateSchema } = await import("@/features/agent-api/practice/types"))
})

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

const auth = { apiKey: { assistantId: "asst-1" } }
const input = (over: Record<string, unknown> = {}) => ({
  practice_type: "mcq_normal" as const,
  topics: ["Pencernaan"],
  total_questions: 3,
  verify: true,
  stream: false,
  ...over,
})

/** Capture console output; the outcome line is asserted by regex. */
function captureConsole() {
  const lines: string[] = []
  const origInfo = console.info
  const origWarn = console.warn
  console.info = (...a: unknown[]) => lines.push(a.map(String).join(" "))
  console.warn = (...a: unknown[]) => lines.push(a.map(String).join(" "))
  return {
    lines,
    outcome: () => lines.find((l) => l.startsWith("[V1 Practice] outcome")),
    restore: () => {
      console.info = origInfo
      console.warn = origWarn
    },
  }
}

/** Freeze Date.now and Math.random so two runs of the same mocks agree byte for byte. */
function freezeDeterminism() {
  const realRandom = Math.random
  const realNow = Date.now
  Math.random = () => 0.42
  Date.now = () => 1_700_000_000_000
  return () => {
    Math.random = realRandom
    Date.now = realNow
  }
}

function parseSSE(text: string) {
  return text
    .split("\n\n")
    .filter((block) => block.trim() && !block.startsWith(":"))
    .map((block) => ({
      event: /^event: (.*)$/m.exec(block)?.[1] ?? "",
      data: /^data: ([\s\S]*)$/m.exec(block)?.[1] ?? "",
    }))
}

const OUTCOME_RE = (status: number, code: string, over: Record<string, string> = {}) =>
  new RegExp(
    `^\\[V1 Practice\\] outcome status=${status} code=${code} requested=\\d+ delivered=\\d+ ` +
      `adapter_calls=\\d+ checks=\\d+ rejected=\\{[^}]*\\} topics=\\d+ skipped=\\d+ type=mcq_normal ` +
      `verify=true stream=(true|false) ms=\\d+ retrieval_ms=\\d+ generate_ms=\\d+ label_ms=\\d+ aborted=(true|false)$`,
  )

const savedEnv: Record<string, string | undefined> = {}
const BASE_NOW = 1_700_000_000_000

beforeAll(() => {
  for (const k of ["AGENT_API_PRACTICE_CHECKER_MODEL", "AGENT_API_PRACTICE_LABEL_MODEL"]) {
    savedEnv[k] = process.env[k]
  }
  process.env.AGENT_API_PRACTICE_CHECKER_MODEL = "off"
})

afterAll(() => {
  kbRetrievalMockActive = false
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v
})

beforeEach(() => {
  adapterCalls.length = 0
  soalCounter = 0
  adapterOverride = null
  generateTextCalls = 0
  generateTextImpl = async () => ({ text: '{"materi": []}' })
  delete process.env.AGENT_API_PRACTICE_LABEL_MODEL
  _resetLabelBreaker()
  _setLabelBreakerClock(() => Date.now())
})

// ---------------------------------------------------------------------------
// 1. Non-stream success (positive control) + the outcome line.
// ---------------------------------------------------------------------------

describe("non-stream success (issue 10/11 controls)", () => {
  it("keeps today's JSON response shape and logs one outcome line with the right fields", async () => {
    const cap = captureConsole()
    try {
      const res = await runPracticeGenerate(auth, input())
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("application/json")
      const set = JSON.parse(await res.text()) as {
        practice_type: string
        topic: string
        topics: string[]
        total_questions: number
        materi_titles: string[]
        questions: Array<{ question_id: string; type: string; materi: string; options: Record<string, string>; answer_key: string; pembahasan: string }>
        report: { requested: number; delivered: number; adapter_calls: number; checks_run: number; rejected: Record<string, number>; skipped_topics: string[] }
      }
      expect(set.practice_type).toBe("mcq_normal")
      expect(set.topics).toEqual(["Pencernaan"])
      expect(set.total_questions).toBe(3)
      expect(set.questions.map((q) => q.question_id)).toEqual(["q1", "q2", "q3"])
      // Options are shuffled with the key moved along with them, so the key
      // must point at the amilase option, wherever it landed.
      expect(set.questions.every((q) => q.type === "mcq_single" && q.options[q.answer_key] === "amilase")).toBe(true)
      expect(set.questions.every((q) => q.materi === "Sistem Pencernaan" && q.pembahasan.length > 0)).toBe(true)
      expect(set.report).toMatchObject({ requested: 3, delivered: 3, checks_run: 0, skipped_topics: [] })
      expect(Object.values(set.report.rejected).every((v) => v === 0)).toBe(true)

      const line = cap.outcome()
      expect(line).toBeTruthy()
      expect(line).toMatch(OUTCOME_RE(200, "ok"))
      expect(line).toContain("requested=3 delivered=3 ")
      expect(line).toContain("topics=1 skipped=0 type=mcq_normal verify=true stream=false")
      expect(line).toContain("aborted=false")
      // Exactly one outcome line per request.
      expect(cap.lines.filter((l) => l.startsWith("[V1 Practice] outcome")).length).toBe(1)
    } finally {
      cap.restore()
    }
  })

  it("stream defaults to false in the schema, so nothing changes for existing callers", () => {
    expect(PracticeGenerateSchema.parse({ practice_type: "mcq_normal", topic: "x" }).stream).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Stream: progress order, monotonic delivered, result === non-stream body.
// ---------------------------------------------------------------------------

describe("stream progress (issue 10)", () => {
  it("sends ordered progress events and a result identical to the non-stream body", async () => {
    const unfreeze = freezeDeterminism()
    const cap = captureConsole()
    try {
      const jsonRes = await runPracticeGenerate(auth, input())
      const jsonBody = await jsonRes.text()

      adapterCalls.length = 0
      soalCounter = 0
      const res = await runPracticeGenerate(auth, input(), { stream: true })
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe("text/event-stream")
      const text = await res.text()
      const events = parseSSE(text)

      const progress = events.filter((e) => e.event === "progress").map((e) => JSON.parse(e.data) as {
        stage: string
        delivered: number
        total: number
        adapter_calls: number
        elapsed_s: number
      })
      // Stage changes in order: retrieval first, labelling last; generation
      // events in between carry the accepted count, never going backwards.
      expect(progress[0]).toMatchObject({ stage: "retrieval", delivered: 0, total: 3 })
      expect(progress[progress.length - 1].stage).toBe("labelling")
      const genStages = progress.filter((p) => p.stage === "generating" || p.stage === "checking")
      expect(genStages.length).toBeGreaterThan(0)
      for (const p of progress) {
        expect(p.total).toBe(3)
        expect(p.elapsed_s).toBeGreaterThanOrEqual(0)
        expect(p.adapter_calls).toBeGreaterThanOrEqual(0)
      }
      const delivered = progress.map((p) => p.delivered)
      expect([...delivered].sort((a, b) => a - b)).toEqual(delivered)

      const result = events.filter((e) => e.event === "result")
      expect(result).toHaveLength(1)
      expect(result[0].data).toBe(jsonBody)
      // One outcome line per request; the streamed one records stream=true.
      const outcomeLines = cap.lines.filter((l) => l.startsWith("[V1 Practice] outcome"))
      expect(outcomeLines.length).toBe(2)
      expect(outcomeLines[0]).toMatch(OUTCOME_RE(200, "ok"))
      expect(outcomeLines[0]).toContain("stream=false")
      expect(outcomeLines[1]).toMatch(OUTCOME_RE(200, "ok"))
      expect(outcomeLines[1]).toContain("stream=true")
    } finally {
      cap.restore()
      unfreeze()
    }
  })

  it("answers a topic the books do not cover with event: error (422), then closes", async () => {
    const cap = captureConsole()
    try {
      const res = await runPracticeGenerate(auth, input({ topics: ["tidak ada di buku"] }), { stream: true })
      const text = await res.text()
      const events = parseSSE(text)
      expect(events.some((e) => e.event === "result")).toBe(false)
      const err = events.find((e) => e.event === "error")
      expect(err).toBeTruthy()
      expect(JSON.parse(err!.data)).toEqual({
        error: { message: "I don't know based on the available books.", type: "not_grounded", code: "topic_not_in_books" },
        status: 422,
      })
      expect(cap.outcome()).toMatch(OUTCOME_RE(422, "topic_not_in_books"))
    } finally {
      cap.restore()
    }
  })

  it("answers a failed generation with event: error (502) and no result event", async () => {
    const cap = captureConsole()
    try {
      adapterOverride = () => ({ ok: false, failure: "timeout" })
      const res = await runPracticeGenerate(auth, input({ total_questions: 2 }), { stream: true })
      const events = parseSSE(await res.text())
      expect(events.some((e) => e.event === "result")).toBe(false)
      const err = events.find((e) => e.event === "error")
      expect(err).toBeTruthy()
      const data = JSON.parse(err!.data) as { error: { message: string; type: string; code: string }; status: number }
      expect(data.status).toBe(502)
      expect(data.error).toMatchObject({ type: "server_error", code: "generation_failed" })
      expect(data.error.message).toContain("did not answer in time")
      expect(cap.outcome()).toMatch(OUTCOME_RE(502, "generation_failed"))
    } finally {
      cap.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Label model fails fast behind the circuit breaker (issue 11).
// ---------------------------------------------------------------------------

describe("label model circuit breaker", () => {
  it("opens on a quota error, skips the model until 10 minutes pass, then tries again", async () => {
    process.env.AGENT_API_PRACTICE_LABEL_MODEL = "rantai/prime"
    generateTextImpl = async () => {
      throw new Error("Token Plan usage limit reached")
    }
    let clock = BASE_NOW
    _setLabelBreakerClock(() => clock)

    const cap = captureConsole()
    try {
      const first = await runPracticeGenerate(auth, input())
      expect(first.status).toBe(200)
      expect(generateTextCalls).toBe(1) // one attempt, no SDK retries
      const set = JSON.parse(await first.text()) as { questions: Array<{ materi: string }> }
      // Derived labels, not model labels.
      expect(set.questions.every((q) => q.materi === "Sistem Pencernaan")).toBe(true)

      const second = await runPracticeGenerate(auth, input())
      expect(second.status).toBe(200)
      expect(generateTextCalls).toBe(1) // the breaker skipped the model entirely

      clock = BASE_NOW + LABEL_BREAKER_MS + 1 // the 10 minutes are up
      const third = await runPracticeGenerate(auth, input())
      expect(third.status).toBe(200)
      expect(generateTextCalls).toBe(2) // tried again

      const breakerLines = cap.lines.filter((l) => l.includes("circuit breaker"))
      expect(breakerLines.some((l) => l.includes("opened"))).toBe(true)
      expect(breakerLines.some((l) => l.includes("closed"))).toBe(true)
    } finally {
      cap.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Client disconnect: abort stops further adapter calls (issue 10/11).
// ---------------------------------------------------------------------------

describe("aborted request", () => {
  it("stops further adapter calls and logs aborted=true", async () => {
    const cap = captureConsole()
    const controller = new AbortController()
    // Round 1 fires three parallel calls; the second reply duplicates the
    // first, so a refill call would follow — unless the abort stops it.
    const dupReply = { ok: true, text: JSON.stringify({ soal: [{ pertanyaan: "Soal tetap sama ....", opsi: { A: "amilase", B: "b", C: "c", D: "d" }, kunci: ["A"] }] }) }
    adapterOverride = ({ index }) => {
      if (index === 0 || index === 1) return dupReply
      controller.abort()
      return undefined
    }
    try {
      const res = await runPracticeGenerate(auth, input(), { signal: controller.signal })
      expect(res.status).toBe(499)
      const body = JSON.parse(await res.text()) as { error: { code: string } }
      expect(body.error.code).toBe("client_disconnected")
      // Three first-round calls, no refill, no second round.
      expect(adapterCalls.length).toBe(3)
      const line = cap.outcome()
      expect(line).toMatch(OUTCOME_RE(499, "client_disconnected"))
      expect(line).toContain("aborted=true")
      expect(cap.lines.filter((l) => l.startsWith("[V1 Practice] outcome")).length).toBe(1)
    } finally {
      cap.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// 5. 502 details carry the adapter timeout count (issue 11).
// ---------------------------------------------------------------------------

describe("generation_failed details", () => {
  it("reports adapter_timeouts when the adapter times out", async () => {
    const cap = captureConsole()
    try {
      adapterOverride = () => ({ ok: false, failure: "timeout" })
      const res = await runPracticeGenerate(auth, input({ total_questions: 2 }))
      expect(res.status).toBe(502)
      const body = JSON.parse(await res.text()) as {
        error: { message: string; type: string; code: string; details: { rejected: Record<string, number>; adapter_calls: number; adapter_timeouts: number; adapter_errors: number } }
      }
      expect(body.error.code).toBe("generation_failed")
      expect(body.error.message).toContain("The practice model did not answer in time")
      expect(body.error.details.adapter_timeouts).toBeGreaterThanOrEqual(1)
      expect(body.error.details.adapter_errors).toBe(0)
      expect(body.error.details.adapter_calls).toBeGreaterThanOrEqual(1)
      expect(Object.values(body.error.details.rejected).every((v) => v === 0)).toBe(true)
      expect(cap.outcome()).toMatch(OUTCOME_RE(502, "generation_failed"))
    } finally {
      cap.restore()
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Engine: duplicate refill prefers an unused passage (wasted rounds).
// ---------------------------------------------------------------------------

const mkPassage = (marker: string) =>
  `${PASSAGE_WORDS} Bagian ${marker} menjelaskan proses pencernaan dengan urutan langkah yang jelas dan contoh sehari-hari.`

describe("duplicate refill passage choice", () => {
  it("refills from a passage the group has not used yet", async () => {
    const texts = ["satu", "dua", "tiga", "empat"].map(mkPassage)
    const materials: TopicMaterial[] = [
      { topic: "T", passages: texts.map((text) => ({ title: "B", section: null, text })) },
    ]
    const seen: string[] = []
    let call = 0
    const fixed = { pertanyaan: "Soal tetap sama ....", opsi: { A: "amilase", B: "b", C: "c", D: "d" }, kunci: ["A"] }
    // Distinguish questions by whole words, not digits: the duplicate check
    // ignores tokens of two letters or fewer.
    const unique = (i: number) => ({
      pertanyaan: `Soal benda${i} tentang alat${i} dan proses${i} pada sistem${i}?`,
      opsi: { A: "amilase", B: `benda${i}salah`, C: `alat${i}salah`, D: `proses${i}salah` },
      kunci: ["A"] as string[],
    })
    const generate = async (_t: unknown, _n: number, passage: string) => {
      seen.push(passage)
      call++
      return [call === 1 || call === 3 ? { ...fixed } : unique(call)]
    }
    const r = await buildPracticeSet(
      { topics: materials, count: 3, type: "mcq_normal", verify: false },
      { generate, check: null, rng: () => 0.42 },
    )
    expect(r.questions).toHaveLength(3)
    expect(seen).toHaveLength(4) // three first-round calls + one refill
    const firstRound = new Set(seen.slice(0, 3))
    expect(firstRound.size).toBe(3)
    // The refill call went to the one passage the group had not used.
    expect(firstRound.has(seen[3])).toBe(false)
    expect(texts).toContain(seen[3])
  })

  it("reuses the passage with the fewest accepted questions once every passage was used", async () => {
    const texts = [mkPassage("alpha"), mkPassage("beta")]
    const materials: TopicMaterial[] = [
      { topic: "T", passages: texts.map((text) => ({ title: "B", section: null, text })) },
    ]
    const seen: string[] = []
    let call = 0
    let checks = 0
    const q = (i: number) => ({
      pertanyaan: `Soal benda${i} tentang alat${i} dan proses${i} pada sistem${i}?`,
      opsi: { A: "amilase", B: `benda${i}salah`, C: `alat${i}salah`, D: `proses${i}salah` },
      kunci: ["A"] as string[],
    })
    // Round 1: call 1 asks 2 questions on the first passage, call 2 asks 1 on
    // the second; only the third checked candidate (call 2's, on the second
    // passage) is accepted. Round 2 asks 1 per passage; the second-passage
    // reply duplicates the first-passage reply, so one refill follows — and
    // it must go to the FIRST passage, the one with the fewest accepted
    // questions, where the old round-robin rotation reused the second.
    const generate = async (_t: unknown, n: number, passage: string) => {
      seen.push(passage)
      call++
      if (call === 4) return [q(30)] // duplicates call 3's question
      return Array.from({ length: n }, (_, k) => q(call * 10 + k))
    }
    const check = async () => {
      checks++
      if (checks === 3) return { ok: true, answer: null }
      return { ok: checks > 3, answer: checks > 3 ? null : ["D"] }
    }
    const r = await buildPracticeSet(
      { topics: materials, count: 3, type: "mcq_normal", verify: true },
      { generate, check, rng: () => 0.42 },
    )
    expect(r.questions).toHaveLength(3)
    expect(seen).toHaveLength(5) // 2 (round 1) + 2 (round 2) + 1 refill
    // The refill (last call) went to the passage without the round-1 accept.
    expect(seen[4]).toBe(seen[2])
    expect(seen[4]).not.toBe(seen[1])
  })
})
