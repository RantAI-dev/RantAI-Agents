/**
 * The OpenAI-compatible half of the streams oracle: the frames and body of
 * /v1/chat/completions, produced by the OLD `src/features/agent-api/response.ts` with the
 * fake `streamText` result its own test uses. See streams.ts for the overview.
 */

import { createJsonResponse, createSSEStreamResponse, toOpenAIFinishReason } from "../../src/features/agent-api/response"
import type { RagSource } from "../../src/features/agent-api/response"
import { SOURCE_ROWS, type Case } from "./streams_ui"

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number }

/** A stand-in for the SDK's streamText result: the members the builders read. */
function fakeResult(
  deltas: string[],
  options: {
    finishReason?: string
    usage?: Usage | null
    /** The text stream itself throws, the way a dead upstream does. */
    fail?: boolean
  } = {},
): never {
  const textStream = options.fail
    ? (async function* () {
        throw new Error("boom")
      })()
    : (async function* () {
        for (const delta of deltas) yield delta
      })()
  const usage: Usage = { inputTokens: 11, outputTokens: 7, totalTokens: 18 }
  return {
    textStream,
    text: Promise.resolve(deltas.join("")),
    finishReason: Promise.resolve(options.finishReason ?? "stop"),
    totalUsage:
      options.usage === null
        ? Promise.reject(new Error("usage unavailable"))
        : Promise.resolve(options.usage ?? usage),
  } as never
}

/** The frames of an SSE response, each frame complete with its `data: …\n\n` envelope. */
async function frames(response: Response): Promise<string[]> {
  const body = await response.text()
  return body
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => `${line}\n\n`)
}

/** The response headers `createSSEStreamResponse` sets, taken from `response.ts`. */
const OPENAI_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
}

function groundingOf(input: { grounded: boolean; retrieval_score: number } | undefined) {
  return input
    ? { grounded: input.grounded, retrieval_score: input.retrieval_score }
    : undefined
}

async function streamCase(cases: Case[], input: {
  requestId: string
  deltas: string[]
  finishReason?: string
  sources?: RagSource[]
  grounding?: { grounded: boolean; retrieval_score: number }
  usage?: Usage | null
}): Promise<void> {
  const response = createSSEStreamResponse(
    fakeResult(input.deltas, { finishReason: input.finishReason, usage: input.usage }),
    input.requestId,
    "askv6",
    input.sources ?? [],
    undefined,
    groundingOf(input.grounding),
  )
  cases.push({ kind: "openai-stream", input, expected: await response.text() })
}

/** A stand-in for the inline-figure feed: `response.ts` reads only these three methods. */
const FIGURE = {
  n: 3,
  cited: true,
  title: "Bagian-Bagian Mulut",
  section: "Gambar 1.11 Bagian-Bagian Mulut",
  page: 40,
  mime: "image/webp",
  width: 200,
  height: 100,
  bytes: 1234,
  data: "AAEC",
}
const figureFeed = {
  onDelta: async (delta: string) => (delta.startsWith("3]") ? [FIGURE] : []),
  // Nothing selected-but-uncited for this answer, the way the real feed reports it.
  remaining: async () => [],
  forText: async () => [FIGURE],
}

async function bodyCase(cases: Case[], input: {
  requestId: string
  text: string
  finishReason?: string
  sources?: RagSource[]
  grounding?: { grounded: boolean; retrieval_score: number }
  figures?: Array<Record<string, unknown>>
}): Promise<void> {
  const response = await createJsonResponse(
    fakeResult([input.text], { finishReason: input.finishReason }),
    input.requestId,
    "askv6",
    input.sources ?? [],
    (input.figures ? figureFeed : undefined) as never,
    groundingOf(input.grounding),
  )
  cases.push({ kind: "openai-completion-body", input, expected: await response.text() })
}

export async function openaiCases(): Promise<Case[]> {
  const cases: Case[] = []

  const streams: Parameters<typeof streamCase>[1][] = [
    { requestId: "req-1", deltas: ["Halo!\n", "Apa kabar?"] },
    { requestId: "req-2", deltas: [], finishReason: "stop" },
    {
      requestId: "req-3",
      deltas: ["Kelenjar parotis [1] terbesar."],
      sources: SOURCE_ROWS.slice(0, 2),
      grounding: { grounded: true, retrieval_score: 0.842 },
    },
    {
      requestId: "req-4",
      deltas: ["Tidak ketemu di buku."],
      sources: SOURCE_ROWS,
      grounding: { grounded: false, retrieval_score: 0 },
    },
    { requestId: "req-5", deltas: ["Terpotong…"], finishReason: "other" },
    { requestId: "req-6", deltas: ["Panjang."], finishReason: "length" },
    { requestId: "req-7", deltas: ["Terfilter."], finishReason: "content-filter" },
    { requestId: "req-8", deltas: ["Panggil alat."], finishReason: "tool-calls" },
    { requestId: "req-9", deltas: ["Alat gagal."], finishReason: "error" },
    { requestId: "req-10", deltas: ["Sumber tanpa nilai opsional."], sources: [SOURCE_ROWS[2]] },
    {
      requestId: "req-11",
      deltas: ["Kutip \"ganda\", emoji 🎉, baris baru:\nkedua, \\backslash."],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    { requestId: "req-12", deltas: ["Tanpa usage."], usage: null },
  ]
  for (const input of streams) await streamCase(cases, input)

  {
    const response = createSSEStreamResponse(fakeResult([], { fail: true }), "req-err", "askv6")
    cases.push({
      kind: "openai-stream-error",
      input: { requestId: "req-err" },
      expected: await response.text(),
    })
  }
  {
    const response = createSSEStreamResponse(fakeResult([]), "req-h", "askv6")
    cases.push({
      kind: "openai-headers",
      input: { requestId: "req-h" },
      expected: OPENAI_HEADERS,
    })
  }

  cases.push({
    kind: "openai-finish-reason",
    input: { reason: undefined },
    expected: toOpenAIFinishReason(undefined),
  })
  for (const reason of ["stop", "length", "content-filter", "tool-calls", "other", "unknown", "error"]) {
    cases.push({
      kind: "openai-finish-reason",
      input: { reason },
      expected: toOpenAIFinishReason(reason),
    })
  }

  {
    const response = createSSEStreamResponse(
      fakeResult(["Sebelum [figure:", "3] sesudah."]),
      "req-fig",
      "askv6",
      SOURCE_ROWS.slice(0, 2),
      figureFeed as never,
    )
    const withFigure = (await frames(response)).find((frame) => frame.includes("\"figure\":"))
    if (!withFigure) throw new Error("no figure frame found")
    cases.push({
      kind: "openai-figure-frame",
      input: { requestId: "req-fig", figure: FIGURE },
      expected: withFigure,
    })
  }

  const bodies: Parameters<typeof bodyCase>[1][] = [
    { requestId: "req-b1", text: "Jawaban biasa." },
    { requestId: "req-b2", text: "Dengan sumber.", sources: SOURCE_ROWS.slice(0, 2) },
    {
      requestId: "req-b3",
      text: "Di luar cakupan.",
      sources: SOURCE_ROWS,
      grounding: { grounded: false, retrieval_score: 0 },
    },
    {
      requestId: "req-b4",
      text: "Skor diputar.",
      grounding: { grounded: true, retrieval_score: 0.842 },
    },
    { requestId: "req-b5", text: "Terpotong…", finishReason: "other" },
    { requestId: "req-b6", text: "Alat gagal.", finishReason: "error" },
    { requestId: "req-b7", text: "Kutip \"ganda\", emoji 🎉.\nBaris kedua, \\backslash." },
    {
      requestId: "req-fig-body",
      text: "Jawaban dengan gambar.",
      sources: SOURCE_ROWS.slice(0, 2),
      figures: [FIGURE],
    },
  ]
  for (const input of bodies) await bodyCase(cases, input)

  return cases
}
