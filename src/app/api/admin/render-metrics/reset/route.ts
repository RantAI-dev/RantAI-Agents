import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resetMetrics } from "@/lib/document-script/metrics"

export const runtime = "nodejs"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean)
  if (!adminIds.includes(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  resetMetrics()
  return NextResponse.json({ ok: true })
}
