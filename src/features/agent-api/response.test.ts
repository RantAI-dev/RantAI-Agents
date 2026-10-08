import { describe, expect, it, vi } from "vitest"
import sharp from "sharp"
import { createInlineFigureFeed } from "./inline-figures"
import { createJsonResponse, createSSEStreamResponse, type RagSource } from "./response"

const DOC = "30d591e6-7d21-4e9b-92c7-52a14965740a"
const sources: RagSource[] = [
  { title: "IPA Kelas VIII", section: "Bab 1", chunkType: "text", documentId: DOC, page: 39 },
  { title: "IPA Kelas VIII", section: "Bab 1 > Mulut", chunkType: "text", documentId: DOC, page: 40 },
  { title: "IPA Kelas VIII", section: "Gambar 1.11 Bagian-Bagian Mulut", chunkType: "figure", documentId: DOC, assetKey: `documents/org1/${DOC}/assets/fig-p40-53.png`, page: 40 },
]

const png = () =>
  sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer()

/** A stand-in for the SDK's streamText result: the three members the builders read. */
function fakeResult(deltas: string[]) {
  return {
    textStream: (async function* () { for (const d of deltas) yield d })(),
    text: Promise.resolve(deltas.join("")),
    finishReason: Promise.resolve("stop"),
    totalUsage: Promise.resolve({ inputTokens: 11, outputTokens: 7, totalTokens: 18 }),
  } as never
}

async function frames(res: Response): Promise<Array<Record<string, any> | "[DONE]">> {
  const body = await res.text()
  return body
    .split("\n\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => l.slice(6))
    .map((p) => (p === "[DONE]" ? "[DONE]" : JSON.parse(p)))
}

const DELTAS = ["Kelenjar ludah menghasilkan air liur [2].\n", "[figure:", "3]\n", "Makanan lalu ditelan."]

describe("createSSEStreamResponse", () => {
  it("sends the figure in its own frame right after the delta that completes the tag", async () => {
    const feed = createInlineFigureFeed(sources, { download: png })
    const out = await frames(createSSEStreamResponse(fakeResult(DELTAS), "id1", "askv6", sources, feed))

    const kinds = out.map((f) =>
      f === "[DONE]" ? "done" : f.figure ? "figure" : f.usage ? "usage" : f.sources ? "final" : `text:${f.choices[0].delta.content}`,
    )
    expect(kinds).toEqual([
      `text:${DELTAS[0]}`,
      `text:${DELTAS[1]}`,
      `text:${DELTAS[2]}`,
      "figure",
      `text:${DELTAS[3]}`,
      "final",
      "usage",
      "done",
    ])

    const frame = out[3] as Record<string, any>
    expect(frame.object).toBe("chat.completion.chunk")
    expect(frame.choices).toEqual([{ index: 0, delta: {}, finish_reason: null }])
    expect(frame.figure).toMatchObject({ n: 3, section: "Gambar 1.11 Bagian-Bagian Mulut", page: 40, mime: "image/webp", width: 200, height: 100 })
    const decoded = await sharp(Buffer.from(frame.figure.data, "base64")).metadata()
    expect([decoded.format, decoded.width, decoded.height]).toEqual(["webp", 200, 100])
  })

  it("is unchanged when figures were not requested", async () => {
    const out = await frames(createSSEStreamResponse(fakeResult(DELTAS), "id1", "askv6", sources))
    expect(out.some((f) => f !== "[DONE]" && "figure" in f)).toBe(false)
    expect(out).toHaveLength(DELTAS.length + 3)
    const final = out[DELTAS.length] as Record<string, any>
    expect(final.sources).toEqual(sources)
    expect(final.choices[0].finish_reason).toBe("stop")
  })

  it("keeps streaming the answer when the image cannot be loaded", async () => {
    const warn = vi.fn()
    const feed = createInlineFigureFeed(sources, { download: async () => { throw new Error("storage down") }, warn })
    const out = await frames(createSSEStreamResponse(fakeResult(DELTAS), "id1", "askv6", sources, feed))
    expect(out.some((f) => f !== "[DONE]" && "figure" in f)).toBe(false)
    expect(out.filter((f) => f !== "[DONE]" && f.choices?.[0]?.delta?.content).map((f: any) => f.choices[0].delta.content).join("")).toBe(DELTAS.join(""))
    expect(out.at(-1)).toBe("[DONE]")
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe("createJsonResponse", () => {
  it("adds a figures array for the cited figures when requested", async () => {
    const feed = createInlineFigureFeed(sources, { download: png })
    const body = await (await createJsonResponse(fakeResult(DELTAS), "id1", "askv6", sources, feed)).json()
    expect(body.choices[0].message.content).toBe(DELTAS.join(""))
    expect(body.figures).toHaveLength(1)
    expect(body.figures[0]).toMatchObject({ n: 3, mime: "image/webp" })
    expect(body.sources).toEqual(sources)
  })

  it("has no figures key when figures were not requested", async () => {
    const body = await (await createJsonResponse(fakeResult(DELTAS), "id1", "askv6", sources)).json()
    expect("figures" in body).toBe(false)
    expect(body.usage).toEqual({ prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 })
  })

  it("returns an empty figures array when the answer cites none", async () => {
    const feed = createInlineFigureFeed(sources, { download: png })
    const body = await (await createJsonResponse(fakeResult(["Hanya teks [1]."]), "id1", "askv6", sources, feed)).json()
    expect(body.figures).toEqual([])
  })
})

describe("grounding signal", () => {
  const grounding = { grounded: false, retrieval_score: 0.31 }

  it("rides on the final SSE frame beside sources", async () => {
    const out = await frames(createSSEStreamResponse(fakeResult(DELTAS), "id1", "askv6", sources, undefined, grounding))
    const last = out.filter((f): f is Record<string, any> => f !== "[DONE]" && Boolean(f.choices?.[0]?.finish_reason)).at(-1)!
    expect(last).toMatchObject({ grounded: false, retrieval_score: 0.31 })
  })

  it("is in the JSON body", async () => {
    const body = await (await createJsonResponse(fakeResult(DELTAS), "id1", "askv6", sources, undefined, grounding)).json()
    expect(body).toMatchObject({ grounded: false, retrieval_score: 0.31 })
  })

  it("is absent when retrieval did not run", async () => {
    const body = await (await createJsonResponse(fakeResult(DELTAS), "id1", "askv6", sources)).json()
    expect("grounded" in body).toBe(false)
    expect("retrieval_score" in body).toBe(false)
  })
})
