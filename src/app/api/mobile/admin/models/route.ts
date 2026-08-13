import { NextResponse } from "next/server"
import { requireMobileAdmin } from "@/lib/mobile-admin"
import {
  listAdminModels,
  setModelEnabled,
  setModelToolCalling,
  setDefaultChatModel,
} from "@/features/platform-admin/models-service"

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const params = new URL(request.url).searchParams
  const result = await listAdminModels({
    search: params.get("search") ?? undefined,
    providerId: params.get("providerId") ?? undefined,
  })
  return NextResponse.json(result)
}

export async function PATCH(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await request.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  let result: { ok?: boolean; error?: string; defaultModelId?: string }
  if (body.default === true) {
    result = await setDefaultChatModel(auth.user, body.id)
  } else if (typeof body.enabled === "boolean") {
    result = await setModelEnabled(auth.user, body.id, body.enabled)
  } else if (typeof body.hasToolCalling === "boolean") {
    result = await setModelToolCalling(auth.user, body.id, body.hasToolCalling)
  } else {
    return NextResponse.json(
      { error: "Nothing to update (enabled, default, or hasToolCalling)" },
      { status: 400 },
    )
  }
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
