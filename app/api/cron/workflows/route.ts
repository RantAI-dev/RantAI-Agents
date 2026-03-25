import { NextResponse } from "next/server"
import { runWorkflowCron } from "@/src/features/platform-routes/cron-workflows/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

/**
 * GET /api/cron/workflows — Scheduled workflow execution handler.
 *
 * Called by an external cron service (e.g. Vercel Cron, crontab) every minute.
 * Iterates all active workflows with schedule triggers, checks if they're
 * due to run, and executes them.
 *
 * Security: Protected by CRON_SECRET header to prevent unauthorized invocation.
 */
export async function GET(req: Request) {
  try {
    const result = await runWorkflowCron({
      authorizationHeader: req.headers.get("authorization"),
      cronSecret: process.env.CRON_SECRET,
      nodeEnv: process.env.NODE_ENV,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Cron] Workflow execution error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cron execution failed" }, { status: 500 })
  }
}
