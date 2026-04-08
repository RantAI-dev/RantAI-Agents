import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { findAssetById } from "@/features/media/repository"
import { getPresignedDownloadUrl } from "@/lib/s3"

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await ctx.params
  const asset = await findAssetById(id)
  if (!asset || asset.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const url = await getPresignedDownloadUrl(asset.s3Key)

  // Return JSON by default; redirect to presigned URL when ?inline=1
  const inline = new URL(req.url).searchParams.get("inline")
  if (inline === "1") {
    return NextResponse.redirect(url)
  }
  return NextResponse.json({ url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes })
}
