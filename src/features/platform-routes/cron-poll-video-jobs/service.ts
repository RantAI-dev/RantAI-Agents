import { pollVideoJob, fetchVideoBytes } from "@/features/media/provider/openrouter"
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
      const status = await pollVideoJob({ apiKey, providerJobId: job.providerJobId })

      if (status.status === "succeeded" && status.videoUrl) {
        const bytes = await fetchVideoBytes(status.videoUrl)
        const upload = await uploadMediaBytes({
          organizationId: job.organizationId,
          modality: "VIDEO",
          assetId: job.id,
          mimeType: "video/mp4",
          extension: "mp4",
          bytes,
        })

        await finalizeMediaJobAsSucceeded({
          jobId: job.id,
          costCents: status.actualCostCents ?? job.estimatedCostCents ?? 1,
          assets: [
            {
              modality: "VIDEO",
              mimeType: "video/mp4",
              s3Key: upload.s3Key,
              sizeBytes: upload.sizeBytes,
              metadata: { providerJobId: job.providerJobId },
            },
          ],
        })

        emitToOrgRoom(job.organizationId, "media:job:update", {
          jobId: job.id,
          status: "SUCCEEDED",
        })
        advanced++
      } else if (status.status === "failed") {
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
