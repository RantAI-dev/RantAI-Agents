/**
 * Unit tests for the VLM figure gate.
 *
 * The gate is the difference between showing a student the right picture 2.8%
 * of the time and 54.2% of the time, so the properties worth guarding are the
 * ones that silently destroy that number rather than the ones that throw:
 * a gate that fails OPEN would ship wrong figures, a gate that judges the whole
 * candidate list would triple answer latency, and a gate that mis-reads a reply
 * would invert the verdict.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseVerdict, gateConfig, gateFigures, type GateConfig } from "../../src/lib/rag/figure-gate"

vi.mock("@/lib/s3", () => ({
  downloadFile: vi.fn(async (key: string) => {
    if (key.includes("missing")) throw new Error("no such key")
    return Buffer.from("png-bytes")
  }),
}))

const cfg: GateConfig = { base: "http://vlm/v1", model: "m", topN: 2, maxKeep: 2, timeoutMs: 1000 }
const cand = (id: string, assetKey = `k/${id}.png`) => ({ id, assetKey, caption: `cap ${id}` })

/** A fetch stub answering each call with the next verdict in the list. */
function stubReplies(replies: string[]) {
  let i = 0
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: replies[i++] ?? "TIDAK" } }] }),
  })) as unknown as typeof fetch
}

describe("parseVerdict", () => {
  it("accepts a bare YA", () => {
    expect(parseVerdict("YA")).toBe(true)
    expect(parseVerdict(" ya \n")).toBe(true)
  })

  it("rejects TIDAK, including when the model also says YA", () => {
    expect(parseVerdict("TIDAK")).toBe(false)
    // Models hedge — "YA, tapi TIDAK dibutuhkan" must not count as a yes.
    expect(parseVerdict("YA, tapi TIDAK dibutuhkan")).toBe(false)
  })

  it("rejects anything it cannot read, rather than guessing", () => {
    for (const junk of ["", "   ", "mungkin", "1", "YANG"]) {
      expect(parseVerdict(junk)).toBe(false)
    }
  })
})

describe("gateConfig", () => {
  it("is off unless explicitly enabled", () => {
    expect(gateConfig({} as NodeJS.ProcessEnv)).toBeNull()
    expect(
      gateConfig({ KB_FIGURE_VLM_BASE: "http://x/v1", KB_FIGURE_VLM_MODEL: "m" } as NodeJS.ProcessEnv),
    ).toBeNull()
  })

  it("stays off when enabled but not told where to call", () => {
    expect(gateConfig({ KB_FIGURE_VLM_ENABLED: "1" } as NodeJS.ProcessEnv)).toBeNull()
    expect(
      gateConfig({ KB_FIGURE_VLM_ENABLED: "1", KB_FIGURE_VLM_BASE: "http://x/v1" } as NodeJS.ProcessEnv),
    ).toBeNull()
  })

  it("defaults topN to the measured operating point", () => {
    const c = gateConfig({
      KB_FIGURE_VLM_ENABLED: "1",
      KB_FIGURE_VLM_BASE: "http://x/v1/",
      KB_FIGURE_VLM_MODEL: "m",
    } as NodeJS.ProcessEnv)
    expect(c).not.toBeNull()
    expect(c!.topN).toBe(2)
    expect(c!.base).toBe("http://x/v1") // trailing slash trimmed
  })

  it("defaults to showing a single figure", () => {
    const c = gateConfig({
      KB_FIGURE_VLM_ENABLED: "1",
      KB_FIGURE_VLM_BASE: "http://x/v1",
      KB_FIGURE_VLM_MODEL: "m",
    } as NodeJS.ProcessEnv)
    expect(c!.maxKeep).toBe(1)
  })

  it("ignores a nonsense topN rather than judging zero figures", () => {
    const c = gateConfig({
      KB_FIGURE_VLM_ENABLED: "1",
      KB_FIGURE_VLM_BASE: "http://x/v1",
      KB_FIGURE_VLM_MODEL: "m",
      KB_FIGURE_VLM_TOPN: "0",
    } as NodeJS.ProcessEnv)
    expect(c!.topN).toBe(2)
  })
})

describe("gateFigures", () => {
  const realFetch = globalThis.fetch
  beforeEach(() => vi.spyOn(console, "log").mockImplementation(() => {}))
  afterEach(() => {
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  it("keeps only what the model vouches for, in the order given", async () => {
    globalThis.fetch = stubReplies(["TIDAK", "YA"])
    const out = await gateFigures("q", [cand("a"), cand("b")], cfg)
    expect(out.map((c) => c.id)).toEqual(["b"])
  })

  it("never judges more than topN, so latency stays bounded", async () => {
    const f = stubReplies(["YA", "YA", "YA", "YA"])
    globalThis.fetch = f
    const out = await gateFigures("q", [cand("a"), cand("b"), cand("c"), cand("d")], cfg)
    expect(f).toHaveBeenCalledTimes(2)
    expect(out.map((c) => c.id)).toEqual(["a", "b"])
  })

  it("preserves the reranker's order among survivors", async () => {
    globalThis.fetch = stubReplies(["YA", "YA"])
    const out = await gateFigures("q", [cand("first"), cand("second")], { ...cfg, topN: 2 })
    expect(out.map((c) => c.id)).toEqual(["first", "second"])
  })

  it("fails closed when the model errors", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
    expect(await gateFigures("q", [cand("a")], cfg)).toEqual([])
  })

  it("fails closed when the call throws or times out", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    expect(await gateFigures("q", [cand("a")], cfg)).toEqual([])
  })

  it("drops a figure whose image cannot be fetched", async () => {
    globalThis.fetch = stubReplies(["YA", "YA"])
    const out = await gateFigures("q", [cand("a", "k/missing.png"), cand("b")], cfg)
    expect(out.map((c) => c.id)).toEqual(["b"])
  })

  it("shows only maxKeep survivors even when the model approves both", async () => {
    globalThis.fetch = stubReplies(["YA", "YA"])
    const out = await gateFigures("q", [cand("a"), cand("b")], { ...cfg, maxKeep: 1 })
    expect(out.map((c) => c.id)).toEqual(["a"])
  })

  it("returns nothing for no candidates without calling out", async () => {
    const f = stubReplies([])
    globalThis.fetch = f
    expect(await gateFigures("q", [], cfg)).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})
