import { NextResponse } from "next/server"
import { runModelSync } from "@/features/platform-routes/cron-sync-models/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

/**
 * GET /api/cron/sync-models — Sync LLM models from OpenRouter.
 *
 * Called by an external cron service (e.g. Vercel Cron, crontab).
 * Fetches all models from tracked labs + free models with tool support,
 * upserts them into the LlmModel table, and soft-deactivates stale models.
 *
 * Security: Protected by CRON_SECRET header to prevent unauthorized invocation.
 */
export async function GET(req: Request) {
  try {
    const result = await runModelSync({
      authorizationHeader: req.headers.get("authorization"),
      cronSecret: process.env.CRON_SECRET,
      nodeEnv: process.env.NODE_ENV,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Cron] Model sync error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Model sync failed" },
      { status: 500 }
    )
  }
}
