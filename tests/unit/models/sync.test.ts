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

describe("syncModelsFromOpenRouter — model selection", () => {
  beforeEach(() => {
    upsertMock.mockReset()
    upsertMock.mockResolvedValue({})
    fetchMock.mockReset()
  })

  const paidTextModel = (id: string) => ({
    id,
    name: id,
    context_length: 1_000_000,
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    pricing: { prompt: "0.000001", completion: "0.000002" },
    supported_parameters: ["tools"],
  })

  function serve(ids: string[]) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      statusText: "OK",
      status: 200,
      json: async () => ({ data: ids.map(paidTextModel) }),
    })
  }

  const syncedIds = () => upsertMock.mock.calls.map((c) => c[0].where.id)

  it("skips :batch variants but keeps the base model", async () => {
    serve(["openai/gpt-6-luna", "openai/gpt-6-luna:batch"])

    const result = await syncModelsFromOpenRouter()

    expect(syncedIds()).toEqual(["openai/gpt-6-luna"])
    expect(result.trackedLab).toBe(1)
  })

  it("syncs paid models from the MiniMax, Xiaomi, Meta and NVIDIA labs", async () => {
    const ids = [
      "minimax/minimax-m3",
      "xiaomi/mimo-v2.6-flash",
      "meta/muse-spark-1.3",
      "nvidia/nemotron-3.5-lightning",
    ]
    serve([...ids, "some-untracked-lab/paid-model"])

    await syncModelsFromOpenRouter()

    expect(syncedIds()).toEqual(ids)
    const providers = upsertMock.mock.calls.map((c) => c[0].create.provider)
    expect(providers).toEqual(["MiniMax", "Xiaomi", "Meta", "NVIDIA"])
  })
})
