import { NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { findAssetById } from "@/features/media/repository"
import { getS3Client, getBucket } from "@/lib/s3"

// Stream media bytes through the app instead of redirecting to a presigned S3
// URL. RustFS is internal-only (no published port; Caddy fronts only the app),
// so a presigned URL points at http://rustfs:9000/... which the browser can't
// resolve. Proxying keeps assets same-origin + auth-gated and supports Range so
// <video>/<audio> seeking still works.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const orgContext = await resolveActiveOrg(req, session.user.id)
  if (!orgContext) return NextResponse.json({ error: "No organization context" }, { status: 401 })
  const { id } = await ctx.params
  const asset = await findAssetById(id)
  if (!asset || asset.organizationId !== orgContext.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const params = new URL(req.url).searchParams
  const wantsDownload = params.get("download") === "1"
  const extension = asset.mimeType.split("/")[1]?.split(";")[0] ?? "bin"
  const disposition = `${wantsDownload ? "attachment" : "inline"}; filename="${asset.id}.${extension}"`

  // Back-compat: ?inline=0 callers expect JSON. Return a same-origin URL that
  // streams the bytes (never the internal rustfs host).
  if (params.get("inline") === "0") {
    const selfUrl = `/api/dashboard/media/assets/${asset.id}/download${wantsDownload ? "?download=1" : ""}`
    return NextResponse.json({ url: selfUrl, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes })
  }

  const range = req.headers.get("range") ?? undefined

  let s3res
  try {
    s3res = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: asset.s3Key,
        ...(range ? { Range: range } : {}),
      })
    )
  } catch {
    return NextResponse.json({ error: "Asset bytes not found" }, { status: 404 })
  }

  const body = s3res.Body
  if (!body) return NextResponse.json({ error: "Asset bytes not found" }, { status: 404 })
  const bytes = await body.transformToByteArray()

  const headers = new Headers()
  headers.set("Content-Type", asset.mimeType)
  headers.set("Content-Disposition", disposition)
  headers.set("Accept-Ranges", "bytes")
  headers.set("Cache-Control", "private, max-age=31536000, immutable")
  headers.set("Content-Length", String(bytes.byteLength))
  if (s3res.ContentRange) headers.set("Content-Range", s3res.ContentRange)

  return new Response(bytes, {
    status: range && s3res.ContentRange ? 206 : 200,
    headers,
  })
}
