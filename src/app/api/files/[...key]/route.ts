import { NextResponse } from "next/server"
import { GetObjectCommand } from "@aws-sdk/client-s3"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import {
  FilesRouteParamsSchema,
  FilesRouteQuerySchema,
} from "@/features/platform-routes/files/schema"
import { accessFileByKey } from "@/features/platform-routes/files/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getS3Client, getBucket } from "@/lib/s3"

/**
 * GET /api/files/[...key] - Stream a stored file through the app.
 *
 * The key is the full S3 path, e.g. /api/files/documents/org123/doc456/file.pdf
 *
 * RustFS is internal-only (no published port; Caddy fronts only the app), so we
 * stream bytes through the app rather than redirecting to a presigned
 * http://rustfs:9000/... URL the browser can't resolve. accessFileByKey still
 * performs the access check; we only changed how the bytes are delivered.
 *
 * Query params:
 * - redirect=false: Return JSON with a same-origin streaming URL (back-compat).
 * - download=true: Force download (Content-Disposition: attachment).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = FilesRouteParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "File key required" }, { status: 400 })
    }
    const s3Key = parsedParams.data.key.join("/")

    const url = new URL(request.url)
    const parsedQuery = FilesRouteQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    const shouldRedirect = parsedQuery.success
      ? parsedQuery.data.redirect !== "false"
      : url.searchParams.get("redirect") !== "false"
    const forceDownload = parsedQuery.success
      ? parsedQuery.data.download === "true"
      : url.searchParams.get("download") === "true"
    const orgContext = await resolveActiveOrg(request, session.user.id)

    const result = await accessFileByKey({
      s3Key,
      userId: session.user.id,
      organizationId: orgContext?.organizationId ?? null,
      shouldRedirect,
      forceDownload,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // Back-compat: redirect=false callers get JSON, but with a same-origin URL
    // that streams the bytes (never the internal rustfs host).
    if (!result.shouldRedirect) {
      const selfUrl = `/api/files/${s3Key}${forceDownload ? "?download=true" : ""}`
      return NextResponse.json({
        url: selfUrl,
        filename: result.filename,
        contentType: result.contentType,
        size: result.size,
        expiresAt: result.expiresAt,
      })
    }

    const range = request.headers.get("range") ?? undefined
    let s3res
    try {
      s3res = await getS3Client().send(
        new GetObjectCommand({
          Bucket: getBucket(),
          Key: s3Key,
          ...(range ? { Range: range } : {}),
        })
      )
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const body = s3res.Body
    if (!body) return NextResponse.json({ error: "File not found" }, { status: 404 })
    // Stream the S3 body straight through instead of buffering the whole object
    // (or range) into memory first. This keeps heap usage flat and TTFB low even
    // for large files and concurrent Range/video requests.
    const stream = body.transformToWebStream()

    const headers = new Headers()
    headers.set("Content-Type", result.contentType)
    headers.set(
      "Content-Disposition",
      `${forceDownload ? "attachment" : "inline"}; filename="${result.filename.replace(/"/g, "")}"`
    )
    headers.set("Accept-Ranges", "bytes")
    headers.set("Cache-Control", "private, max-age=3600")
    // ContentLength reflects the bytes in this response (the range length for
    // partial responses); set it when the SDK reports it so clients get progress
    // and seeking without us having to buffer the body to measure it.
    if (typeof s3res.ContentLength === "number") {
      headers.set("Content-Length", String(s3res.ContentLength))
    }
    if (s3res.ContentRange) headers.set("Content-Range", s3res.ContentRange)

    return new Response(stream, {
      status: range && s3res.ContentRange ? 206 : 200,
      headers,
    })
  } catch (error) {
    console.error("[Files API] Error:", error)
    return NextResponse.json({ error: "Failed to access file" }, { status: 500 })
  }
}
