import { prisma } from "@/lib/prisma"
import { emitToOrgRoom } from "@/lib/socket"
import {
  createMediaJobRow,
  setJobRunning,
  finalizeMediaJobAsSucceeded,
  failMediaJob,
  type FinalizeAssetInput,
} from "./repository"
import { uploadMediaBytes, downloadMediaBytes } from "./storage"
import { generateImage, generateAudio, generateVideo } from "./provider/openrouter"
import { getCapability } from "./model-capabilities"
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

async function logMediaAuditEvent(input: {
  jobId: string
  organizationId: string
  userId: string
  modality: MediaModality
  modelId: string
  costCents: number
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        action: "media.generate",
        resource: `MediaJob:${input.jobId}`,
        riskLevel: "low",
        detail: {
          modality: input.modality,
          modelId: input.modelId,
          costCents: input.costCents,
        },
      },
    })
  } catch (error) {
    console.warn("[media] audit log write failed:", error)
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

async function loadReferenceUrls(
  assetIds: string[],
  organizationId: string
): Promise<string[]> {
  if (assetIds.length === 0) return []
  const assets = await prisma.mediaAsset.findMany({
    where: {
      id: { in: assetIds },
      organizationId,
      modality: "IMAGE",
    },
    select: { id: true, s3Key: true, mimeType: true },
  })
  // Fetch bytes and return as base64 data URIs. OpenRouter's image and video
  // APIs both accept data URIs, so this avoids needing public S3 URLs.
  const results: string[] = []
  for (const a of assets) {
    const { bytes, mimeType } = await downloadMediaBytes(a.s3Key)
    const b64 = Buffer.from(bytes).toString("base64")
    results.push(`data:${a.mimeType ?? mimeType};base64,${b64}`)
  }
  return results
}

export async function createMediaJob(input: CreateMediaJobInput) {
  const model = await loadModel(input.modelId)

  // ── Per-model capability validation ──────────────────
  const capability = getCapability(input.modelId, input.modality)

  if (input.referenceAssetIds.length > capability.maxReferenceImages) {
    throw new Error(
      `${input.modelId} accepts at most ${capability.maxReferenceImages} reference image${
        capability.maxReferenceImages === 1 ? "" : "s"
      }, got ${input.referenceAssetIds.length}.`
    )
  }

  if (
    capability.supportedAspectRatios &&
    typeof input.parameters.aspectRatio === "string" &&
    !capability.supportedAspectRatios.includes(input.parameters.aspectRatio)
  ) {
    throw new Error(
      `${input.modelId} does not support aspect ratio "${input.parameters.aspectRatio}". Supported: ${capability.supportedAspectRatios.join(", ")}.`
    )
  }

  if (
    capability.supportedDurationsSec &&
    typeof input.parameters.durationSec === "number" &&
    !capability.supportedDurationsSec.includes(input.parameters.durationSec)
  ) {
    throw new Error(
      `${input.modelId} does not support duration ${input.parameters.durationSec}s. Supported: ${capability.supportedDurationsSec.join(", ")}s.`
    )
  }

  if (
    capability.supportedResolutions &&
    typeof input.parameters.resolution === "string" &&
    !capability.supportedResolutions.includes(input.parameters.resolution)
  ) {
    throw new Error(
      `${input.modelId} does not support resolution "${input.parameters.resolution}". Supported: ${capability.supportedResolutions.join(", ")}.`
    )
  }

  // TODO: Calculate estimated cost based on model pricing
  const estimatedCostCents = 0

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

  try {
    await setJobRunning(job.id)
    emitToOrgRoom(input.organizationId, "media:job:update", {
      jobId: job.id,
      status: "RUNNING",
    })

    if (input.modality === "IMAGE") {
      return await runImageJob({
        jobId: job.id,
        organizationId: input.organizationId,
        userId: input.userId,
        modelId: input.modelId,
        prompt: input.prompt,
        parameters: input.parameters,
        referenceAssetIds: input.referenceAssetIds,
        estimatedCostCents,
      })
    }

    if (input.modality === "AUDIO") {
      return await runAudioJob({
        jobId: job.id,
        organizationId: input.organizationId,
        userId: input.userId,
        modelId: input.modelId,
        prompt: input.prompt,
        parameters: input.parameters,
        estimatedCostCents,
      })
    }

    if (input.modality === "VIDEO") {
      return await runVideoJob({
        jobId: job.id,
        organizationId: input.organizationId,
        userId: input.userId,
        modelId: input.modelId,
        prompt: input.prompt,
        parameters: input.parameters,
        referenceAssetIds: input.referenceAssetIds,
        estimatedCostCents,
      })
    }

    throw new Error(`Modality not yet implemented: ${input.modality}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[media] job ${job.id} failed:`, error)
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
  userId: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  referenceAssetIds: string[]
  estimatedCostCents: number
}) {
  const apiKey = getOpenRouterApiKey()
  const referenceImageUrls = await loadReferenceUrls(input.referenceAssetIds, input.organizationId)

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

  await logMediaAuditEvent({
    jobId: input.jobId,
    organizationId: input.organizationId,
    userId: input.userId,
    modality: "IMAGE",
    modelId: input.modelId,
    costCents,
  })

  emitToOrgRoom(input.organizationId, "media:job:update", {
    jobId: input.jobId,
    status: "SUCCEEDED",
  })

  return finalized
}

async function runAudioJob(input: {
  jobId: string
  organizationId: string
  userId: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  estimatedCostCents: number
}) {
  const apiKey = getOpenRouterApiKey()
  const result = await generateAudio({
    apiKey,
    modelId: input.modelId,
    prompt: input.prompt,
    parameters: input.parameters,
  })

  const extension = result.audio.mimeType === "audio/mpeg" ? "mp3" : result.audio.mimeType.split("/")[1] ?? "mp3"
  const upload = await uploadMediaBytes({
    organizationId: input.organizationId,
    modality: "AUDIO",
    assetId: input.jobId,
    mimeType: result.audio.mimeType,
    extension,
    bytes: result.audio.bytes,
  })

  const audioCostCents = result.actualCostCents ?? input.estimatedCostCents
  const finalized = await finalizeMediaJobAsSucceeded({
    jobId: input.jobId,
    costCents: audioCostCents,
    assets: [
      {
        modality: "AUDIO",
        mimeType: result.audio.mimeType,
        s3Key: upload.s3Key,
        sizeBytes: upload.sizeBytes,
        durationMs: result.audio.durationMs ?? null,
        metadata: { modelId: input.modelId },
      },
    ],
  })

  await logMediaAuditEvent({
    jobId: input.jobId,
    organizationId: input.organizationId,
    userId: input.userId,
    modality: "AUDIO",
    modelId: input.modelId,
    costCents: audioCostCents,
  })

  emitToOrgRoom(input.organizationId, "media:job:update", {
    jobId: input.jobId,
    status: "SUCCEEDED",
  })
  return finalized
}

async function runVideoJob(input: {
  jobId: string
  organizationId: string
  userId: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  referenceAssetIds: string[]
  estimatedCostCents: number
}) {
  const apiKey = getOpenRouterApiKey()
  const referenceDataUrls = await loadReferenceUrls(
    input.referenceAssetIds,
    input.organizationId
  )
  // Alpha video API expects input_references in OpenAI content-part shape.
  const inputReferences = referenceDataUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }))
  const result = await generateVideo({
    apiKey,
    modelId: input.modelId,
    prompt: input.prompt,
    parameters:
      inputReferences.length > 0
        ? { ...input.parameters, inputReferences }
        : input.parameters,
  })

  const extension =
    result.video.mimeType.split("/")[1]?.split(";")[0] ?? "mp4"
  const upload = await uploadMediaBytes({
    organizationId: input.organizationId,
    modality: "VIDEO",
    assetId: input.jobId,
    mimeType: result.video.mimeType,
    extension,
    bytes: result.video.bytes,
  })

  const videoCostCents = result.actualCostCents ?? input.estimatedCostCents
  const finalized = await finalizeMediaJobAsSucceeded({
    jobId: input.jobId,
    costCents: videoCostCents,
    assets: [
      {
        modality: "VIDEO",
        mimeType: result.video.mimeType,
        s3Key: upload.s3Key,
        sizeBytes: upload.sizeBytes,
        width: result.video.width ?? null,
        height: result.video.height ?? null,
        durationMs: result.video.durationMs ?? null,
        metadata: { modelId: input.modelId },
      },
    ],
  })

  await logMediaAuditEvent({
    jobId: input.jobId,
    organizationId: input.organizationId,
    userId: input.userId,
    modality: "VIDEO",
    modelId: input.modelId,
    costCents: videoCostCents,
  })

  emitToOrgRoom(input.organizationId, "media:job:update", {
    jobId: input.jobId,
    status: "SUCCEEDED",
  })
  return finalized
}
