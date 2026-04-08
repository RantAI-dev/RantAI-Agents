import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import type { MediaModality, MediaJobStatus } from "./schema"

export interface CreateJobRowInput {
  organizationId: string
  userId: string
  modality: MediaModality
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  referenceAssetIds: string[]
  estimatedCostCents: number
  providerJobId?: string
}

export async function createMediaJobRow(input: CreateJobRowInput) {
  return prisma.mediaJob.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      modality: input.modality,
      modelId: input.modelId,
      prompt: input.prompt,
      parameters: input.parameters as Prisma.InputJsonValue,
      referenceAssetIds: input.referenceAssetIds,
      estimatedCostCents: input.estimatedCostCents,
      providerJobId: input.providerJobId ?? null,
      status: "PENDING",
    },
    include: { assets: true },
  })
}

export async function setJobRunning(jobId: string, providerJobId?: string) {
  return prisma.mediaJob.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      providerJobId: providerJobId ?? undefined,
    },
    include: { assets: true },
  })
}

export interface FinalizeAssetInput {
  modality: MediaModality
  mimeType: string
  s3Key: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  durationMs?: number | null
  thumbnailS3Key?: string | null
  metadata?: Record<string, unknown>
}

export async function finalizeMediaJobAsSucceeded(input: {
  jobId: string
  costCents: number
  assets: FinalizeAssetInput[]
}) {
  const job = await prisma.mediaJob.findUniqueOrThrow({ where: { id: input.jobId } })

  await prisma.$transaction([
    prisma.mediaAsset.createMany({
      data: input.assets.map((a) => ({
        jobId: job.id,
        organizationId: job.organizationId,
        modality: a.modality,
        mimeType: a.mimeType,
        s3Key: a.s3Key,
        sizeBytes: a.sizeBytes,
        width: a.width ?? null,
        height: a.height ?? null,
        durationMs: a.durationMs ?? null,
        thumbnailS3Key: a.thumbnailS3Key ?? null,
        metadata: (a.metadata ?? {}) as Prisma.InputJsonValue,
      })),
    }),
    prisma.mediaJob.update({
      where: { id: input.jobId },
      data: {
        status: "SUCCEEDED",
        costCents: input.costCents,
        completedAt: new Date(),
      },
    }),
  ])

  return prisma.mediaJob.findUniqueOrThrow({
    where: { id: input.jobId },
    include: { assets: true },
  })
}

export async function failMediaJob(jobId: string, errorMessage: string) {
  return prisma.mediaJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      errorMessage,
      completedAt: new Date(),
    },
    include: { assets: true },
  })
}

export async function cancelMediaJob(jobId: string) {
  return prisma.mediaJob.update({
    where: { id: jobId },
    data: { status: "CANCELLED", completedAt: new Date() },
    include: { assets: true },
  })
}

export async function findJobById(jobId: string) {
  return prisma.mediaJob.findUnique({
    where: { id: jobId },
    include: { assets: true },
  })
}

export interface ListJobsInput {
  userId: string
  modality?: MediaModality
  status?: MediaJobStatus
  cursor?: string
  limit: number
}

export async function listJobsForUser(input: ListJobsInput) {
  const where: Prisma.MediaJobWhereInput = {
    userId: input.userId,
    ...(input.modality && { modality: input.modality }),
    ...(input.status && { status: input.status }),
  }

  const items = await prisma.mediaJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: input.limit + 1,
    ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
    include: { assets: true },
  })

  const hasMore = items.length > input.limit
  return {
    items: hasMore ? items.slice(0, input.limit) : items,
    nextCursor: hasMore ? items[input.limit - 1]?.id : null,
  }
}

export interface ListAssetsInput {
  organizationId: string
  modality?: MediaModality
  favorite?: boolean
  q?: string
  cursor?: string
  limit: number
  sort: "new" | "old"
}

export async function listAssetsForOrg(input: ListAssetsInput) {
  const where: Prisma.MediaAssetWhereInput = {
    organizationId: input.organizationId,
    ...(input.modality && { modality: input.modality }),
    ...(input.favorite !== undefined && { isFavorite: input.favorite }),
    ...(input.q && {
      job: {
        prompt: { contains: input.q, mode: "insensitive" as Prisma.QueryMode },
      },
    }),
  }

  const items = await prisma.mediaAsset.findMany({
    where,
    orderBy: { createdAt: input.sort === "new" ? "desc" : "asc" },
    take: input.limit + 1,
    ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
    include: { job: { select: { prompt: true, modelId: true, costCents: true } } },
  })

  const hasMore = items.length > input.limit
  return {
    items: hasMore ? items.slice(0, input.limit) : items,
    nextCursor: hasMore ? items[input.limit - 1]?.id : null,
  }
}

export async function findAssetById(assetId: string) {
  return prisma.mediaAsset.findUnique({
    where: { id: assetId },
    include: { job: true },
  })
}

export async function toggleAssetFavorite(assetId: string, isFavorite: boolean) {
  return prisma.mediaAsset.update({
    where: { id: assetId },
    data: { isFavorite },
  })
}

export async function deleteAssetById(assetId: string) {
  return prisma.mediaAsset.delete({ where: { id: assetId } })
}

export async function listRunningVideoJobs() {
  return prisma.mediaJob.findMany({
    where: { modality: "VIDEO", status: "RUNNING" },
    take: 50,
  })
}
