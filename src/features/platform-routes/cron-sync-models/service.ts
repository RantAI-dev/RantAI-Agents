import { syncModelsFromOpenRouter } from "@/lib/models/sync"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Runs the OpenRouter model sync.
 * Called by the cron route on a schedule.
 */
export async function runModelSync(params: {
  authorizationHeader?: string | null
  cronSecret?: string
  nodeEnv?: string
}) {
  if (!params.cronSecret && params.nodeEnv === "production") {
    return { status: 401, error: "CRON_SECRET not configured" } satisfies ServiceError
  }

  if (params.cronSecret) {
    if (params.authorizationHeader !== `Bearer ${params.cronSecret}`) {
      return { status: 401, error: "Unauthorized" } satisfies ServiceError
    }
  }

  const result = await syncModelsFromOpenRouter()

  console.log(
    `[Cron] Model sync complete: ${result.synced} synced (${result.trackedLab} tracked lab, ${result.freeWithTools} free+tools), ${result.deactivated} deactivated`
  )

  return result
}
