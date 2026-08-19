import { NextResponse } from "next/server"

import { ListAssetsQuerySchema } from "@/features/media/schema"
import { listAssetsForOrg } from "@/features/media/repository"
import { getMobileContext } from "@/lib/mobile-org"

/** GET /api/mobile/media/assets — the org's media library (all members' outputs). */
export async function GET(req: Request) {
  const ctx = await getMobileContext(req)
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ctx.organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 400 })
  }

  const url = new URL(req.url)
  const parsed = ListAssetsQuerySchema.safeParse({
    modality: url.searchParams.get("modality") ?? undefined,
    favorite: url.searchParams.get("favorite") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 })
  }

  const result = await listAssetsForOrg({
    organizationId: ctx.organizationId,
    ...parsed.data,
  })
  return NextResponse.json(result)
}
