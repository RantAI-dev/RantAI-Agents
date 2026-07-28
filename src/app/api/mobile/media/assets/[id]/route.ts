import { NextResponse } from "next/server"

import { UpdateAssetInputSchema } from "@/features/media/schema"
import {
  deleteAssetById,
  findAssetById,
  toggleAssetFavorite,
} from "@/features/media/repository"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

async function loadOwnedAsset(assetId: string, organizationId: string) {
  const asset = await findAssetById(assetId)
  if (!asset || asset.organizationId !== organizationId) return null
  return asset
}

// GET /api/mobile/media/assets/[id]
export async function GET(req: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(req)
  if (!ctx || !ctx.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const asset = await loadOwnedAsset(id, ctx.organizationId)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(asset)
}

// PATCH /api/mobile/media/assets/[id] — favorite toggle
export async function PATCH(req: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(req)
  if (!ctx || !ctx.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const asset = await loadOwnedAsset(id, ctx.organizationId)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = UpdateAssetInputSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  if (parsed.data.isFavorite !== undefined) {
    const updated = await toggleAssetFavorite(id, parsed.data.isFavorite)
    return NextResponse.json(updated)
  }
  return NextResponse.json(asset)
}

// DELETE /api/mobile/media/assets/[id]
export async function DELETE(req: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(req)
  if (!ctx || !ctx.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const asset = await loadOwnedAsset(id, ctx.organizationId)
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await deleteAssetById(id)
  return NextResponse.json({ ok: true })
}
