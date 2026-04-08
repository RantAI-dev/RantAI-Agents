import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { findAssetById } from "@/features/media/repository"
import { getPresignedDownloadUrl } from "@/lib/s3"

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
  if (!orgContext) return NextResponse.json({ error: "No organization context" }, { status: 401 })
  const { id } = await ctx.params
  const asset = await findAssetById(id)
  if (!asset || asset.organizationId !== orgContext.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const url = await getPresignedDownloadUrl(asset.s3Key)

  // Redirect to presigned URL by default (for <img src="..."> use case);
  // return JSON when ?inline=0 is explicitly set
  const inline = new URL(req.url).searchParams.get("inline")
  if (inline === "0") {
    return NextResponse.json({ url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes })
  }
  return NextResponse.redirect(url)
}
