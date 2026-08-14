import { NextResponse } from "next/server"
import { requireMobileAdmin } from "@/lib/mobile-admin"
import { getUserDetail, setUserSuspended, setUserRole } from "@/features/platform-admin/users-service"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const detail = await getUserDetail(id)
  if (!detail) return NextResponse.json({ error: "User not found" }, { status: 404 })
  return NextResponse.json(detail)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  if (typeof body.suspended === "boolean") {
    const result = await setUserSuspended(auth.user, id, body.suspended)
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
  }
  if (body.role === "USER" || body.role === "ADMIN") {
    const result = await setUserRole(auth.user, id, body.role)
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
  }
  const detail = await getUserDetail(id)
  if (!detail) return NextResponse.json({ error: "User not found" }, { status: 404 })
  return NextResponse.json(detail)
}
