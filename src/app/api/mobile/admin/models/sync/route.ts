import { NextResponse } from "next/server"
import { requireMobileAdmin } from "@/lib/mobile-admin"
import { syncModelsFromOpenRouter } from "@/lib/models/sync"

export async function POST(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 400 })
  }
  try {
    return NextResponse.json(await syncModelsFromOpenRouter())
  } catch (err) {
    return NextResponse.json(
      { error: `Sync failed: ${err instanceof Error ? err.message : err}` },
      { status: 502 },
    )
  }
}
