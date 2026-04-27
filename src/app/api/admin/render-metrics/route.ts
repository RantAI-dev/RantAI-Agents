import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { metrics } from "@/lib/document-script/metrics"

export const runtime = "nodejs"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Adapt this check to whatever role-check the project already uses.
  // If session has a `role` field, gate on `session.user.role === "admin"`.
  // If not, gate on a hardcoded admin user-id list from env.
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean)
  if (!adminIds.includes(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.json(metrics())
}
