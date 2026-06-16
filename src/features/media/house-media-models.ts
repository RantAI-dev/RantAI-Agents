/**
 * House MEDIA models — white-labeled, first-party media-generation models served
 * by a DIRECT upstream (currently MiniMax) instead of the OpenRouter media path.
 * Users see only RantAI branding; the upstream vendor is server-side only.
 *
 * Analogous to lib/llm/house-models.ts (chat), but for the Media Studio. These
 * are code-defined (not in the synced LlmModel catalog), so they're injected
 * into the media-models picker and skip the DB existence check in the service.
 *
 * Dependency-free + env-free so it's safe to import from server and client.
 * The upstream API key lives in the provider (server-only); per-model capability
 * metadata lives in model-capabilities.ts (keyed by the same id).
 */

export type HouseMediaModality = "IMAGE" | "AUDIO" | "VIDEO"

export interface HouseMediaModel {
  /** White-labeled, client-visible id (namespaced under `rantai/`). */
  id: string
  /** Display name — must NOT reveal the upstream vendor. */
  name: string
  provider: string
  description: string
  modality: HouseMediaModality
  /** Output modalities, matching the LlmModel catalog convention (e.g. ["image"]). */
  outputModalities: string[]
  inputModalities: string[]
  /** Real upstream model id sent to the direct provider (server-side only). */
  backendModel: string
  /**
   * Per-generated-unit cost in cents, tracked for analytics/usage only.
   * NOTE: media generation is not credit-metered yet (see service.ts) — this is
   * recorded on the job/usage, not deducted. Tune when metering lands.
   */
  costCentsPerUnit: number
}

export const HOUSE_MEDIA_MODELS: HouseMediaModel[] = [
  {
    id: "rantai/canvas",
    name: "RantAI Canvas",
    provider: "RantAI",
    description: "Generate images from a text prompt — fast and economical.",
    modality: "IMAGE",
    outputModalities: ["image"],
    inputModalities: ["text"],
    backendModel: "image-01",
    costCentsPerUnit: 1,
  },
  {
    id: "rantai/voice",
    name: "RantAI Voice",
    provider: "RantAI",
    description: "Natural text-to-speech with expressive, multilingual voices.",
    modality: "AUDIO",
    outputModalities: ["audio"],
    inputModalities: ["text"],
    backendModel: "speech-2.6-turbo",
    costCentsPerUnit: 1,
  },
]

const byId = new Map(HOUSE_MEDIA_MODELS.map((m) => [m.id, m]))

export function isHouseMediaModel(id: string): boolean {
  return byId.has(id)
}

export function getHouseMediaModel(id: string): HouseMediaModel | undefined {
  return byId.get(id)
}

/** Map a house media id to its upstream model id; passthrough for non-house ids. */
export function houseMediaBackendModel(id: string): string {
  return byId.get(id)?.backendModel ?? id
}
