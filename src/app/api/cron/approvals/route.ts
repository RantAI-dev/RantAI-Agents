import { NextResponse } from "next/server"
import { processExpiredApprovals } from "@/features/platform-routes/cron-approvals/service"

// GET /api/cron/approvals - Check for expired approvals
export async function GET() {
  try {
    const result = await processExpiredApprovals()
    return NextResponse.json(result)
  } catch (error) {
    console.error("Approval cron failed:", error)
    return NextResponse.json({ error: "Cron failed" }, { status: 500 })
  }
}
