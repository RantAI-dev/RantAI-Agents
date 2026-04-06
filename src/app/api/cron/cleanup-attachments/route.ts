import { NextResponse } from "next/server"
import { CronAuthHeaderSchema } from "@/features/platform-routes/cron-cleanup-attachments/schema"
import { runCleanupAttachments } from "@/features/platform-routes/cron-cleanup-attachments/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

/**
 * Cron endpoint to clean up expired chat attachment documents.
 * Callable by Vercel Cron or external scheduler.
 *
 * Optional: Set CRON_SECRET env var to protect this endpoint.
 */
export async function GET(req: Request) {
  try {
    const parsedHeaders = CronAuthHeaderSchema.safeParse({
      authorization: req.headers.get("authorization") || undefined,
    })
    if (!parsedHeaders.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await runCleanupAttachments({
      authorizationHeader: parsedHeaders.data.authorization,
      cronSecret: process.env.CRON_SECRET,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Cron] Cleanup error:", error)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}
