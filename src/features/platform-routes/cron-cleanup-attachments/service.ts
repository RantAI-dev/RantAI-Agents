import { cleanupAttachments } from "./repository"

export interface ServiceError {
  status: number
  error: string
}

/**
 * Runs scheduled cleanup for temporary chat attachments.
 */
export async function runCleanupAttachments(params: {
  authorizationHeader?: string | null
  cronSecret?: string
}) {
  if (params.cronSecret) {
    if (params.authorizationHeader !== `Bearer ${params.cronSecret}`) {
      return { status: 401, error: "Unauthorized" } satisfies ServiceError
    }
  }

  const result = await cleanupAttachments(24)
  return {
    success: true,
    ...result,
  }
}
