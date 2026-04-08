import type { MediaModality } from "./schema"

export interface CostEstimatorModel {
  id: string
  pricingInput: number
  pricingOutput: number
}

export interface EstimateInput {
  modality: MediaModality
  model: CostEstimatorModel
  parameters: Record<string, unknown>
}

const DEFAULT_VIDEO_DURATION_SEC = 5
const DEFAULT_AUDIO_DURATION_SEC = 10
const DEFAULT_IMAGE_COUNT = 1
const MIN_COST_CENTS = 1

/**
 * Estimate cost in whole cents for a media generation job.
 *
 * Pricing conventions (per OpenRouter `pricing.completion` × 1_000_000 already
 * applied by `src/lib/models/sync.ts`):
 *   - IMAGE: pricingOutput is per-image-equivalent dollars × 1000 (milli-dollars)
 *   - AUDIO: pricingOutput is per-second dollars × 100_000
 *   - VIDEO: pricingOutput is per-second dollars × 1_000_000
 *
 * The per-modality multipliers are tuned in this single file when the
 * actual unit is ambiguous in OpenRouter's catalog.
 */
export function estimateMediaJobCostCents(input: EstimateInput): number {
  const { modality, model, parameters } = input
  const priceMilliDollars = model.pricingOutput

  if (priceMilliDollars <= 0) return MIN_COST_CENTS

  let dollars = 0
  if (modality === "IMAGE") {
    const count = (parameters.count as number | undefined) ?? DEFAULT_IMAGE_COUNT
    dollars = (priceMilliDollars / 1000) * count
  } else if (modality === "AUDIO") {
    const durationSec =
      (parameters.durationSec as number | undefined) ?? DEFAULT_AUDIO_DURATION_SEC
    dollars = (priceMilliDollars / 100_000) * durationSec
  } else if (modality === "VIDEO") {
    const durationSec =
      (parameters.durationSec as number | undefined) ?? DEFAULT_VIDEO_DURATION_SEC
    dollars = (priceMilliDollars / 1_000_000) * durationSec
  }

  return Math.max(MIN_COST_CENTS, Math.round(dollars * 100))
}
