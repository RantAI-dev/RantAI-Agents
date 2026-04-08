import { describe, it, expect } from "vitest"
import { estimateMediaJobCostCents } from "@/features/media/cost-estimator"
import type { MediaModality } from "@/features/media/schema"

interface FakeModel {
  id: string
  pricingInput: number
  pricingOutput: number
}

const imageModel: FakeModel = {
  id: "google/nano-banana-2",
  pricingInput: 0,
  pricingOutput: 30,
}

const videoModel: FakeModel = {
  id: "google/veo-3.1",
  pricingInput: 0,
  pricingOutput: 100000,
}

const audioModel: FakeModel = {
  id: "openai/gpt-audio",
  pricingInput: 0,
  pricingOutput: 800,
}

describe("estimateMediaJobCostCents", () => {
  it("estimates an image job at the model output price times count", () => {
    const cents = estimateMediaJobCostCents({
      modality: "IMAGE" as MediaModality,
      model: imageModel,
      parameters: { count: 2 },
    })
    expect(cents).toBe(6)
  })

  it("estimates a video job from durationSec and per-second price", () => {
    const cents = estimateMediaJobCostCents({
      modality: "VIDEO" as MediaModality,
      model: videoModel,
      parameters: { durationSec: 5 },
    })
    expect(cents).toBe(50)
  })

  it("estimates audio job from durationSec at audio price", () => {
    const cents = estimateMediaJobCostCents({
      modality: "AUDIO" as MediaModality,
      model: audioModel,
      parameters: { durationSec: 30 },
    })
    expect(cents).toBe(24)
  })

  it("falls back to 1 cent when model has zero pricing", () => {
    const cents = estimateMediaJobCostCents({
      modality: "IMAGE" as MediaModality,
      model: { id: "x", pricingInput: 0, pricingOutput: 0 },
      parameters: {},
    })
    expect(cents).toBe(1)
  })
})
