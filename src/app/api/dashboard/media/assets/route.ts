import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { ListAssetsQuerySchema } from "@/features/media/schema"
import { listAssetsForOrg } from "@/features/media/repository"

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
  if (!orgContext) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 })
  }
  const organizationId = orgContext.organizationId

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
    organizationId,
    ...parsed.data,
  })
  return NextResponse.json(result)
}
