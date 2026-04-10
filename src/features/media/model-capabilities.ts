import type { MediaModality } from "./schema"

/**
 * Per-model capability metadata for media generation.
 *
 * Colocated here as a static map so both the frontend and the server can
 * import it without an extra round-trip. For video models, the alpha API
 * exposes `GET /api/alpha/videos/models` with authoritative data — we can
 * layer that on top as a cache later without changing callers.
 */

export type ReferenceRole =
  | "edit" // use the image(s) as the thing to edit
  | "style" // use as style guide
  | "i2v" // starting frame for image-to-video
  | "first-last" // first and (optionally) last frame
  | "multi-ref" // generic multi-image conditioning

export interface MediaModelCapability {
  // ── Input side ─────────────────────────────────────
  maxReferenceImages: number
  referenceRole?: ReferenceRole
  // ── Output side ────────────────────────────────────
  supportedAspectRatios?: string[]
  supportedDurationsSec?: number[]
  supportedResolutions?: string[]
  supportsSeed?: boolean
  supportsNegativePrompt?: boolean
  supportsAudio?: boolean // VIDEO: co-generate audio
}

const DEFAULTS: Record<MediaModality, MediaModelCapability> = {
  IMAGE: {
    maxReferenceImages: 4,
    referenceRole: "edit",
    supportsSeed: true,
    supportsNegativePrompt: true,
  },
  AUDIO: {
    maxReferenceImages: 0,
  },
  VIDEO: {
    maxReferenceImages: 1,
    referenceRole: "i2v",
    supportsSeed: true,
  },
}

export const MODEL_CAPABILITIES: Record<string, MediaModelCapability> = {
  // ── VIDEO ───────────────────────────────────────────
  "google/veo-3.1": {
    maxReferenceImages: 3,
    referenceRole: "multi-ref",
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurationsSec: [4, 6, 8],
    supportedResolutions: ["720p", "1080p", "4K"],
    supportsSeed: true,
    supportsAudio: true,
  },
  "openai/sora-2-pro": {
    maxReferenceImages: 1,
    referenceRole: "i2v",
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurationsSec: [4, 8, 12, 16, 20],
    supportedResolutions: ["720p", "1080p"],
    supportsSeed: true,
    supportsAudio: true,
  },
  "bytedance/seedance-1-5-pro": {
    maxReferenceImages: 2,
    referenceRole: "first-last",
    supportedAspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    supportedDurationsSec: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportedResolutions: ["480p", "720p", "1080p"],
    supportsSeed: true,
  },
  "alibaba/wan-2.6": {
    maxReferenceImages: 2,
    referenceRole: "first-last",
    supportedAspectRatios: ["16:9", "9:16"],
    supportedDurationsSec: [4, 5, 6, 8],
    supportedResolutions: ["720p", "1080p"],
    supportsSeed: true,
  },

  // ── IMAGE ───────────────────────────────────────────
  "google/gemini-2.5-flash-image": {
    maxReferenceImages: 4,
    referenceRole: "edit",
    supportsSeed: true,
  },
  "google/gemini-3-pro-image-preview": {
    maxReferenceImages: 4,
    referenceRole: "edit",
    supportsSeed: true,
  },
  "openai/gpt-image-1": {
    maxReferenceImages: 4,
    referenceRole: "edit",
    supportsSeed: true,
  },
  "openai/gpt-5-image": {
    maxReferenceImages: 4,
    referenceRole: "edit",
    supportsSeed: true,
  },
  "openai/gpt-5-image-mini": {
    maxReferenceImages: 4,
    referenceRole: "edit",
    supportsSeed: true,
  },

  // ── AUDIO ───────────────────────────────────────────
  "google/lyria-3-clip-preview": { maxReferenceImages: 0 },
  "google/lyria-3-pro-preview": { maxReferenceImages: 0 },
  "openai/gpt-4o-audio-preview": { maxReferenceImages: 0 },
  "openai/gpt-audio": { maxReferenceImages: 0 },
  "openai/gpt-audio-mini": { maxReferenceImages: 0 },
}

export function getCapability(
  modelId: string | null | undefined,
  modality: MediaModality
): MediaModelCapability {
  if (modelId && MODEL_CAPABILITIES[modelId]) return MODEL_CAPABILITIES[modelId]
  return DEFAULTS[modality]
}

/** Human-readable label for the reference section header. */
export function referenceRoleLabel(role: ReferenceRole | undefined, max: number): string {
  switch (role) {
    case "edit":
      return max === 1 ? "Image to edit" : `Images to edit (up to ${max})`
    case "style":
      return `Style references (up to ${max})`
    case "i2v":
      return "Starting image"
    case "first-last":
      return max === 1 ? "Starting image" : "First and last frame"
    case "multi-ref":
      return `Reference images (up to ${max})`
    default:
      return `References (up to ${max})`
  }
}
