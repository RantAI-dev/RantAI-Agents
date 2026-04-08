import { z } from "zod"

export const MediaModalitySchema = z.enum(["IMAGE", "AUDIO", "VIDEO"])
export type MediaModality = z.infer<typeof MediaModalitySchema>

export const MediaJobStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
])
export type MediaJobStatus = z.infer<typeof MediaJobStatusSchema>

/**
 * Per-modality parameter shapes. Validation is lenient — providers add new
 * fields frequently and we forward them through to OpenRouter.
 */
export const ImageParametersSchema = z
  .object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    count: z.number().int().min(1).max(4).optional(),
    seed: z.number().int().optional(),
    quality: z.enum(["standard", "hd"]).optional(),
    style: z.string().optional(),
  })
  .passthrough()

export const AudioParametersSchema = z
  .object({
    voice: z.string().optional(),
    format: z.enum(["mp3", "wav", "ogg"]).optional(),
    speed: z.number().min(0.25).max(4).optional(),
    durationSec: z.number().positive().optional(),
  })
  .passthrough()

export const VideoParametersSchema = z
  .object({
    durationSec: z.number().positive().optional(),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
    resolution: z.enum(["480p", "720p", "1080p"]).optional(),
    seed: z.number().int().optional(),
  })
  .passthrough()

export const CreateMediaJobInputSchema = z.object({
  modality: MediaModalitySchema,
  modelId: z.string().min(1),
  prompt: z.string().min(1).max(8000),
  parameters: z.record(z.unknown()).default({}),
  referenceAssetIds: z.array(z.string()).max(4).default([]),
})
export type CreateMediaJobInput = z.infer<typeof CreateMediaJobInputSchema>

export const UpdateAssetInputSchema = z.object({
  isFavorite: z.boolean().optional(),
})
export type UpdateAssetInput = z.infer<typeof UpdateAssetInputSchema>

export const ListJobsQuerySchema = z.object({
  modality: MediaModalitySchema.optional(),
  status: MediaJobStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const ListAssetsQuerySchema = z.object({
  modality: MediaModalitySchema.optional(),
  favorite: z.coerce.boolean().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  sort: z.enum(["new", "old"]).default("new"),
})

export interface MediaAssetDTO {
  id: string
  jobId: string
  modality: MediaModality
  mimeType: string
  s3Key: string
  sizeBytes: number
  width: number | null
  height: number | null
  durationMs: number | null
  thumbnailS3Key: string | null
  isFavorite: boolean
  createdAt: Date
}

export interface MediaJobDTO {
  id: string
  modality: MediaModality
  modelId: string
  prompt: string
  status: MediaJobStatus
  parameters: Record<string, unknown>
  referenceAssetIds: string[]
  errorMessage: string | null
  estimatedCostCents: number | null
  costCents: number | null
  createdAt: Date
  completedAt: Date | null
  assets: MediaAssetDTO[]
}
