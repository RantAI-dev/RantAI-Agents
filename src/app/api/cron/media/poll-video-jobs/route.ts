import { NextResponse } from "next/server"
import { pollPendingVideoJobs } from "@/features/platform-routes/cron-poll-video-jobs/service"

/**
 * GET /api/cron/media/poll-video-jobs — Poll pending video generation jobs.
 *
 * Called by an external cron service (e.g. Vercel Cron, crontab).
 * Checks all RUNNING video jobs against the OpenRouter video API,
 * finalizes succeeded jobs, and marks failed jobs as FAILED.
 *
 * Security: Protected by CRON_SECRET header to prevent unauthorized invocation.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const result = await pollPendingVideoJobs()
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Cron] media poll error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Poll failed" },
      { status: 500 }
    )
  }
}
