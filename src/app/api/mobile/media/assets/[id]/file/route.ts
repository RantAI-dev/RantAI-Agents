import { NextResponse } from "next/server"

import { findAssetById } from "@/features/media/repository"
import { downloadMediaBytes } from "@/features/media/storage"
import { userIdFromMobileToken } from "@/lib/mobile-auth"
import { resolveActiveOrg } from "@/lib/org-context"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/mobile/media/assets/[id]/file — stream the asset bytes through the
 * app server so the phone never needs to reach the (often internal) S3 host.
 *
 * Accepts the token via the `Authorization: Bearer` header OR a `?token=` query
 * param, because React Native's <Image>/<Video> can't reliably attach headers.
 * Add ?download=1 to force an attachment disposition.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const url = new URL(req.url)
  const header = req.headers.get("authorization")
  const rawToken = header?.startsWith("Bearer ")
    ? header.slice(7)
    : url.searchParams.get("token")

  const userId = rawToken ? await userIdFromMobileToken(rawToken) : null
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const org = await resolveActiveOrg(req, userId)
  const organizationId = org?.organizationId ?? null
  if (!organizationId) {
    return NextResponse.json({ error: "No organization context" }, { status: 401 })
  }

  const { id } = await params
  const asset = await findAssetById(id)
  if (!asset || asset.organizationId !== organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const { bytes, mimeType } = await downloadMediaBytes(asset.s3Key)
    const contentType = asset.mimeType || mimeType || "application/octet-stream"
    const wantsDownload = url.searchParams.get("download") === "1"
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
