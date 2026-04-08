import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { UpdateAssetInputSchema } from "@/features/media/schema"
import {
  findAssetById,
  toggleAssetFavorite,
  deleteAssetById,
} from "@/features/media/repository"

async function loadOwnedAsset(assetId: string, organizationId: string) {
  const asset = await findAssetById(assetId)
  if (!asset || asset.organizationId !== organizationId) return null
  return asset
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
  if (!orgContext) return NextResponse.json({ error: "No organization context" }, { status: 401 })
  const { id } = await ctx.params
  const asset = await loadOwnedAsset(id, orgContext.organizationId)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(asset)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
  if (!orgContext) return NextResponse.json({ error: "No organization context" }, { status: 401 })
  const { id } = await ctx.params
  const asset = await loadOwnedAsset(id, orgContext.organizationId)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = UpdateAssetInputSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  if (parsed.data.isFavorite !== undefined) {
    const updated = await toggleAssetFavorite(id, parsed.data.isFavorite)
    return NextResponse.json(updated)
  }
  return NextResponse.json(asset)
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
  if (!orgContext) return NextResponse.json({ error: "No organization context" }, { status: 401 })
  const { id } = await ctx.params
  const asset = await loadOwnedAsset(id, orgContext.organizationId)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await deleteAssetById(id)
  return NextResponse.json({ ok: true })
}
