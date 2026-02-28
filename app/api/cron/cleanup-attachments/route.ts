import { NextResponse } from "next/server"
import { cleanupExpiredAttachments } from "@/lib/chat/cleanup"

/**
 * Cron endpoint to clean up expired chat attachment documents.
 * Callable by Vercel Cron or external scheduler.
 *
 * Optional: Set CRON_SECRET env var to protect this endpoint.
 */
export async function GET(req: Request) {
  // Optional auth via CRON_SECRET
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const result = await cleanupExpiredAttachments(24)
    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error("[Cron] Cleanup error:", error)
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    )
  }
}
