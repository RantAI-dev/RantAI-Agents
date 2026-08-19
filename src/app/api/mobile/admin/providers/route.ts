import { NextResponse } from "next/server"
import { requireMobileAdmin } from "@/lib/mobile-admin"
import { listProviders } from "@/features/platform-admin/providers-service"

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({ providers: await listProviders() })
}
