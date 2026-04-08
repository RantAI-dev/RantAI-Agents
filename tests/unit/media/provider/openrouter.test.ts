import { describe, it, expect, vi, beforeEach } from "vitest"

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

import { generateImage } from "@/features/media/provider/openrouter"

describe("openrouter.generateImage", () => {
  beforeEach(() => fetchMock.mockReset())

  it("calls OpenRouter chat/completions with the correct payload and parses the image", async () => {
    const fakeBytes = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII="
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${fakeBytes}` },
                },
              ],
            },
          },
        ],
        usage: { total_cost: 0.04 },
      }),
    })

    const result = await generateImage({
      apiKey: "test-key",
      modelId: "google/gemini-3.1-flash-image",
      prompt: "a red apple on a wooden table",
      parameters: { width: 1024, height: 1024 },
      referenceImageUrls: [],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions")
    expect(init.method).toBe("POST")
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
    })
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe("google/gemini-3.1-flash-image")
    expect(JSON.stringify(body.messages[0].content)).toContain("a red apple on a wooden table")

    expect(result.images).toHaveLength(1)
    expect(result.images[0].mimeType).toBe("image/png")
    expect(result.images[0].bytes).toBeInstanceOf(Uint8Array)
    expect(result.images[0].bytes.byteLength).toBeGreaterThan(0)
    expect(result.actualCostCents).toBe(4)
  })

  it("includes reference images as input modalities when provided", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,iVBORw0KGgo=` },
                },
              ],
            },
          },
        ],
      }),
    })

    await generateImage({
      apiKey: "k",
      modelId: "google/gemini-3.1-flash-image",
      prompt: "make it blue",
      parameters: {},
      referenceImageUrls: ["https://example.com/img.png"],
    })

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)
    const userMessage = body.messages[0]
    expect(Array.isArray(userMessage.content)).toBe(true)
    expect(userMessage.content).toContainEqual({
      type: "image_url",
      image_url: { url: "https://example.com/img.png" },
    })
  })

  it("throws on non-200 responses with the OpenRouter error message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 402,
      statusText: "Payment Required",
      text: async () => '{"error":{"message":"insufficient credits"}}',
    })

    await expect(
      generateImage({
        apiKey: "k",
        modelId: "x",
        prompt: "p",
        parameters: {},
        referenceImageUrls: [],
      })
    ).rejects.toThrow(/insufficient credits/)
  })
})

import { generateAudio } from "@/features/media/provider/openrouter"

describe("openrouter.generateAudio", () => {
  beforeEach(() => fetchMock.mockReset())

  it("requests audio modalities and parses returned base64 audio", async () => {
    const audioB64 = "UklGRiQAAABXQVZFZm10IBAAAAA=" // "fake wav header"
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              audio: { data: audioB64, format: "wav" },
            },
          },
        ],
        usage: { total_cost: 0.01 },
      }),
    })

    const result = await generateAudio({
      apiKey: "k",
      modelId: "openai/gpt-audio",
      prompt: "hello world",
      parameters: { voice: "alloy", format: "wav" },
    })

    expect(result.audio.mimeType).toBe("audio/wav")
    expect(result.audio.bytes.byteLength).toBeGreaterThan(0)
    expect(result.actualCostCents).toBe(1)
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.modalities).toContain("audio")
    expect(body.audio).toEqual({ voice: "alloy", format: "wav" })
  })
})
