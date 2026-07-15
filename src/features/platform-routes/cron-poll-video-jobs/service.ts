import { prisma } from "@/lib/prisma"
import { pollVideoJobAlpha } from "@/features/media/provider/openrouter"
import { uploadMediaBytes } from "@/features/media/storage"
import {
  finalizeMediaJobAsSucceeded,
  failMediaJob,
  listRunningVideoJobs,
} from "@/features/media/repository"
import { emitToOrgRoom } from "@/lib/socket"

interface PollResult {
  advanced: number
  failed: number
  errors: string[]
}

async function logVideoAuditEvent(input: {
  jobId: string
  organizationId: string
  userId: string
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
          modality: "VIDEO",
          modelId: input.modelId,
          costCents: input.costCents,
        },
      },
    })
  } catch (error) {
    console.warn("[media] video audit log write failed:", error)
  }
}

export async function pollPendingVideoJobs(): Promise<PollResult> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { advanced: 0, failed: 0, errors: ["OPENROUTER_API_KEY not set"] }
  }

  const jobs = await listRunningVideoJobs()
  let advanced = 0
  let failed = 0
  const errors: string[] = []

  for (const job of jobs) {
    if (!job.providerJobId) continue
    try {
      const status = await pollVideoJobAlpha({ apiKey, providerJobId: job.providerJobId })

      if (status.status === "succeeded" && status.video) {
        const mimeType = status.video.mimeType || "video/mp4"
        const extension = mimeType.split("/")[1]?.split(";")[0] ?? "mp4"
        const upload = await uploadMediaBytes({
          organizationId: job.organizationId,
          modality: "VIDEO",
          assetId: job.id,
          mimeType,
          extension,
          bytes: status.video.bytes,
        })

        const costCents = status.actualCostCents ?? job.estimatedCostCents ?? 1
        await finalizeMediaJobAsSucceeded({
          jobId: job.id,
          costCents,
          assets: [
            {
              modality: "VIDEO",
              mimeType,
              s3Key: upload.s3Key,
              sizeBytes: upload.sizeBytes,
              width: status.video.width ?? null,
              height: status.video.height ?? null,
              durationMs: status.video.durationMs ?? null,
              metadata: { modelId: job.modelId, providerJobId: job.providerJobId },
            },
          ],
        })

        await logVideoAuditEvent({
          jobId: job.id,
          organizationId: job.organizationId,
          userId: job.userId,
          modelId: job.modelId,
          costCents,
        })

        emitToOrgRoom(job.organizationId, "media:job:update", {
          jobId: job.id,
          status: "SUCCEEDED",
        })
        advanced++
      } else if (status.status === "failed" || status.status === "cancelled") {
        await failMediaJob(job.id, status.errorMessage ?? "Provider reported failure")
        emitToOrgRoom(job.organizationId, "media:job:update", {
          jobId: job.id,
          status: "FAILED",
          error: status.errorMessage,
        })
        failed++
      }
      // running / queued: leave alone
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${job.id}: ${message}`)
    }
  }

  return { advanced, failed, errors }
}
