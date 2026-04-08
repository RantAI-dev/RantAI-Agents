import { describe, it, expect, vi, beforeEach } from "vitest"

const { upsertMock, updateManyMock } = vi.hoisted(() => {
  const upsertMock = vi.fn()
  const updateManyMock = vi.fn().mockResolvedValue({ count: 0 })
  return { upsertMock, updateManyMock }
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    llmModel: {
      upsert: upsertMock,
      updateMany: updateManyMock,
    },
  },
}))

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

import { syncModelsFromOpenRouter } from "@/lib/models/sync"

describe("syncModelsFromOpenRouter — modality fields", () => {
  beforeEach(() => {
    upsertMock.mockReset()
    upsertMock.mockResolvedValue({})
    fetchMock.mockReset()
  })

  it("writes outputModalities and inputModalities for an image model", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      status: 200,
      json: async () => ({
        data: [
          {
            id: "google/gemini-3.1-flash-image",
            name: "Gemini 3.1 Flash Image",
            context_length: 32000,
            architecture: {
              input_modalities: ["text", "image"],
              output_modalities: ["image"],
            },
            pricing: { prompt: "0", completion: "0" },
            supported_parameters: [],
          },
        ],
      }),
    })

    await syncModelsFromOpenRouter()

    expect(upsertMock).toHaveBeenCalledTimes(1)
    const call = upsertMock.mock.calls[0]?.[0]
    expect(call.create.outputModalities).toEqual(["image"])
    expect(call.create.inputModalities).toEqual(["text", "image"])
    expect(call.update.outputModalities).toEqual(["image"])
    expect(call.update.inputModalities).toEqual(["text", "image"])
  })
})
