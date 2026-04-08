import { prisma } from "@/lib/prisma"
import { emitToOrgRoom } from "@/lib/socket"
import {
  createMediaJobRow,
  setJobRunning,
  finalizeMediaJobAsSucceeded,
  failMediaJob,
  type FinalizeAssetInput,
} from "./repository"
import { enforceMediaLimit } from "./limits"
import { estimateMediaJobCostCents } from "./cost-estimator"
import { uploadMediaBytes } from "./storage"
import { generateImage } from "./provider/openrouter"
import type { MediaModality } from "./schema"

export interface CreateMediaJobInput {
  userId: string
  organizationId: string
  modality: MediaModality
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  referenceAssetIds: string[]
}

export class MediaLimitExceededError extends Error {
  constructor(
    public limitCents: number,
    public usedCents: number,
    public requestedCents: number
  ) {
    super(`Media generation limit exceeded: ${usedCents}+${requestedCents} > ${limitCents}`)
    this.name = "MediaLimitExceededError"
  }
}

function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("OPENROUTER_API_KEY is not set")
  return key
}

async function loadModel(modelId: string) {
  const model = await prisma.llmModel.findUnique({ where: { id: modelId } })
  if (!model) throw new Error(`Model not found: ${modelId}`)
  if (!model.isActive) throw new Error(`Model is inactive: ${modelId}`)
  return model
}

async function loadReferenceUrls(assetIds: string[]): Promise<string[]> {
  if (assetIds.length === 0) return []
  const assets = await prisma.mediaAsset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, s3Key: true, mimeType: true },
  })
  // Phase 1 returns the S3 key as a path-style URL. The Phase 1.5 follow-up
  // will swap this for presigned URLs once the asset download route is wired.
  return assets.map((a) => `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${a.s3Key}`)
}

export async function createMediaJob(input: CreateMediaJobInput) {
  const model = await loadModel(input.modelId)

  const estimatedCostCents = estimateMediaJobCostCents({
    modality: input.modality,
    model,
    parameters: input.parameters,
  })

  const limit = await enforceMediaLimit({
    userId: input.userId,
    estimatedCostCents,
  })
  if (!limit.allowed) {
    throw new MediaLimitExceededError(
      limit.limitCents,
      limit.usedCents,
      limit.requestedCents
    )
  }

  const job = await createMediaJobRow({
    organizationId: input.organizationId,
    userId: input.userId,
    modality: input.modality,
    modelId: input.modelId,
    prompt: input.prompt,
    parameters: input.parameters,
    referenceAssetIds: input.referenceAssetIds,
    estimatedCostCents,
  })

  emitToOrgRoom(input.organizationId, "media:job:update", {
    jobId: job.id,
    status: "PENDING",
  })

  await setJobRunning(job.id)
  emitToOrgRoom(input.organizationId, "media:job:update", {
    jobId: job.id,
    status: "RUNNING",
  })

  try {
    if (input.modality === "IMAGE") {
      return await runImageJob({
        jobId: job.id,
        organizationId: input.organizationId,
        modelId: input.modelId,
        prompt: input.prompt,
        parameters: input.parameters,
        referenceAssetIds: input.referenceAssetIds,
        estimatedCostCents,
      })
    }

    // AUDIO and VIDEO paths land in later tasks; for now, fail loudly
    throw new Error(`Modality not yet implemented: ${input.modality}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failMediaJob(job.id, message)
    emitToOrgRoom(input.organizationId, "media:job:update", {
      jobId: job.id,
      status: "FAILED",
      error: message,
    })
    throw error
  }
}

async function runImageJob(input: {
  jobId: string
  organizationId: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  referenceAssetIds: string[]
  estimatedCostCents: number
}) {
  const apiKey = getOpenRouterApiKey()
  const referenceImageUrls = await loadReferenceUrls(input.referenceAssetIds)

  const result = await generateImage({
    apiKey,
    modelId: input.modelId,
    prompt: input.prompt,
    parameters: input.parameters,
    referenceImageUrls,
  })

  const assets: FinalizeAssetInput[] = []
  for (const [index, image] of result.images.entries()) {
    const assetId = `${input.jobId}_${index}`
    const extension = image.mimeType.split("/")[1] ?? "png"
    const upload = await uploadMediaBytes({
      organizationId: input.organizationId,
      modality: "IMAGE",
      assetId,
      mimeType: image.mimeType,
      extension,
      bytes: image.bytes,
    })
    assets.push({
      modality: "IMAGE",
      mimeType: image.mimeType,
      s3Key: upload.s3Key,
      sizeBytes: upload.sizeBytes,
      width: image.width ?? null,
      height: image.height ?? null,
      metadata: { modelId: input.modelId },
    })
  }

  const costCents = result.actualCostCents ?? input.estimatedCostCents
  const finalized = await finalizeMediaJobAsSucceeded({
    jobId: input.jobId,
    costCents,
    assets,
  })

  emitToOrgRoom(input.organizationId, "media:job:update", {
    jobId: input.jobId,
    status: "SUCCEEDED",
  })

  return finalized
}
