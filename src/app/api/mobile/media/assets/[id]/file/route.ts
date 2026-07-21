import { NextResponse } from "next/server"

import { findAssetById } from "@/features/media/repository"
import { downloadMediaBytes } from "@/features/media/storage"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/mobile/media/assets/[id]/file — stream the asset bytes through the
 * app server so the phone never needs to reach the (often internal) S3 host.
 * Add ?download=1 to force an attachment disposition.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(req)
  if (!ctx || !ctx.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const asset = await findAssetById(id)
  if (!asset || asset.organizationId !== ctx.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const { bytes, mimeType } = await downloadMediaBytes(asset.s3Key)
    const contentType = asset.mimeType || mimeType || "application/octet-stream"
    const wantsDownload = new URL(req.url).searchParams.get("download") === "1"
    const extension = contentType.split("/")[1]?.split(";")[0] ?? "bin"

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(asset.sizeBytes ?? bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    }
    if (wantsDownload) {
      headers["Content-Disposition"] = `attachment; filename="${asset.id}.${extension}"`
    }

    return new NextResponse(Buffer.from(bytes), { headers })
  } catch (error) {
    console.error("[Mobile Media API] file proxy failed:", error)
    return NextResponse.json({ error: "Failed to load asset" }, { status: 500 })
  }
}
