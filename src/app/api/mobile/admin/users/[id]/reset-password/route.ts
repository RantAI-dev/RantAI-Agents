import { NextResponse } from "next/server"
import { requireMobileAdmin } from "@/lib/mobile-admin"
import { resetUserPassword } from "@/features/platform-admin/users-service"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const result = await resetUserPassword(auth.user, id)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 })
  return NextResponse.json(result)
}
