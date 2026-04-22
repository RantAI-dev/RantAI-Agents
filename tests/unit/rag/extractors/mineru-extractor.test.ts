import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { MineruExtractor } from "@/lib/rag/extractors/mineru-extractor"

describe("MineruExtractor", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn() as any
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.resetModules()
  })

  it("posts PDF multipart to /extract and returns the sidecar response", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "# extracted markdown", ms: 1234, pages: 3 }),
    })

    const extractor = new MineruExtractor("http://mineru:8100")
    const result = await extractor.extract(Buffer.from("%PDF-1.5\nfake"))

    expect(result.text).toBe("# extracted markdown")
    expect(result.ms).toBe(1234)
    expect(result.pages).toBe(3)
    expect(result.model).toBe("mineru-2.5-pro")

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe("http://mineru:8100/extract")
    expect(call[1].method).toBe("POST")
    expect(call[1].body).toBeInstanceOf(FormData)
    const form = call[1].body as FormData
    expect(form.get("file")).toBeInstanceOf(Blob)
  })

  it("normalizes base URLs with trailing slashes and /extract suffix", async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ text: "", ms: 0 }),
    })

    for (const base of ["http://m:8100", "http://m:8100/", "http://m:8100/extract", "http://m:8100/extract/"]) {
      const e = new MineruExtractor(base)
      await e.extract(Buffer.from("x"))
    }

    const urls = (global.fetch as any).mock.calls.map((c: any[]) => c[0])
    for (const u of urls) expect(u).toBe("http://m:8100/extract")
  })

  it("throws a descriptive error on non-2xx sidecar responses", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '{"error":"mineru inference failed: ..."}',
    })

    const extractor = new MineruExtractor("http://mineru:8100")
    await expect(extractor.extract(Buffer.from("x"))).rejects.toThrow(/mineru sidecar 500/)
  })

  it("rejects construction without a base URL (config must be set)", () => {
    expect(() => new MineruExtractor("")).toThrow(/KB_EXTRACT_MINERU_BASE_URL/)
  })

  it("falls back to local ms timing when sidecar omits ms", async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "body" }), // no ms field
    })

    const extractor = new MineruExtractor("http://mineru:8100")
    const result = await extractor.extract(Buffer.from("x"))
    expect(result.ms).toBeGreaterThanOrEqual(0)
  })
})
