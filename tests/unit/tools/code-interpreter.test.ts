// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { codeInterpreterTool } from "@/lib/tools/builtin/code-interpreter"

const originalFetch = global.fetch
const originalEnv = { ...process.env }

beforeEach(() => {
  // PISTON_URL stays at its default unless a test overrides it.
  delete process.env.PISTON_URL
})

afterEach(() => {
  global.fetch = originalFetch
  process.env = { ...originalEnv }
})

describe("codeInterpreterTool", () => {
  it("returns success with stdout on a 200 execute response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        language: "javascript",
        version: "*",
        run: { stdout: "hello world\n", stderr: "", output: "hello world\n", code: 0, signal: null },
      }),
    }) as any

    const result = await codeInterpreterTool.execute(
      { language: "javascript", code: "console.log('hello world')" },
      {},
    )

    expect(result).toMatchObject({ success: true, language: "javascript" })
    expect((result as { output: string }).output).toBe("hello world\n")

    const [, init] = (global.fetch as any).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.language).toBe("javascript")
    expect(body.version).toBe("*")
    expect(body.files[0].content).toBe("console.log('hello world')")
  })

  it("retries javascript via alias language when Piston reports runtime unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "{\"message\":\"Runtime 'javascript:18.15.0' is unknown\"}",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          language: "node",
          version: "20.10.0",
          run: { stdout: "42\n", stderr: "", output: "42\n", code: 0, signal: null },
        }),
      })
    global.fetch = fetchMock as any

    const result = await codeInterpreterTool.execute(
      { language: "javascript", code: "console.log(40 + 2)" },
      {},
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(firstBody.language).toBe("javascript")
    expect(firstBody.version).toBe("*")

    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    // Alias retry uses a different `language` token (e.g. "node"), not "javascript".
    expect(["node", "node-javascript"]).toContain(secondBody.language)
    expect(secondBody.version).toBe("*")
    // Same code is sent on the retry.
    expect(secondBody.files[0].content).toBe(firstBody.files[0].content)

    expect(result).toMatchObject({ success: true })
    // The runtimeLanguage field reports which alias actually succeeded.
    expect((result as { runtimeLanguage?: string }).runtimeLanguage).toBe(secondBody.language)
  })

  it("retries typescript via alias language when Piston reports runtime unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Runtime 'typescript:5.0.3' is unknown",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          language: "typescript-node",
          version: "5.0.3",
          run: { stdout: "ok\n", stderr: "", output: "ok\n", code: 0, signal: null },
        }),
      })
    global.fetch = fetchMock as any

    const result = await codeInterpreterTool.execute(
      { language: "typescript", code: "console.log('ok')" },
      {},
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)

    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(["typescript-node", "typesnode"]).toContain(secondBody.language)
    expect(secondBody.version).toBe("*")

    expect(result).toMatchObject({ success: true })
    expect((result as { runtimeLanguage?: string }).runtimeLanguage).toBe(secondBody.language)
  })

  it("returns success:false with an informative error naming Python when all attempts fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Runtime 'javascript:18.15.0' is unknown",
    })
    global.fetch = fetchMock as any

    const result = await codeInterpreterTool.execute(
      { language: "javascript", code: "console.log(1)" },
      {},
    )

    // All candidates attempted (initial + aliases).
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ success: false, language: "javascript" })
    const err = (result as { error: string }).error
    expect(err.toLowerCase()).toContain("javascript")
    expect(err.toLowerCase()).toContain("python")
  })

  it("returns success:false with an informative error for typescript when all attempts fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Runtime not found",
    })
    global.fetch = fetchMock as any

    const result = await codeInterpreterTool.execute(
      { language: "typescript", code: "console.log(1)" },
      {},
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ success: false, language: "typescript" })
    const err = (result as { error: string }).error
    expect(err.toLowerCase()).toContain("typescript")
    expect(err.toLowerCase()).toContain("python")
  })

  it("returns the existing Unsupported language error for unknown input languages", async () => {
    // fetch is not called when the language is unsupported.
    global.fetch = vi.fn() as any

    const result = await codeInterpreterTool.execute(
      // @ts-expect-error — intentionally invoking with an unsupported language to exercise the guard.
      { language: "ruby", code: "puts 1" },
      {},
    )

    expect((global.fetch as any)).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: false, language: "ruby" })
    expect((result as { error: string }).error).toMatch(/unsupported language/i)
  })
})