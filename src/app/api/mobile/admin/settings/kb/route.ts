import { NextResponse } from "next/server"
import { requireMobileAdmin } from "@/lib/mobile-admin"
import { getKbSettings, updateKbSettings } from "@/features/platform-admin/kb-settings-service"

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json(await getKbSettings())
}

export async function PUT(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await request.json().catch(() => null)
  if (!body?.updates || typeof body.updates !== "object") {
    return NextResponse.json({ error: "updates object is required" }, { status: 400 })
  }
  const result = await updateKbSettings(auth.user, body.updates, {
    confirmEmbeddingChange: body.confirmEmbeddingChange === true,
  })
  if ("error" in result) {
    return NextResponse.json(result, { status: result.requiresEmbeddingConfirmation ? 409 : 400 })
  }
  return NextResponse.json(await getKbSettings())
}
