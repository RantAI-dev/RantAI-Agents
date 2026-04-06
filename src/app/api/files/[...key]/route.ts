import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  FilesRouteParamsSchema,
  FilesRouteQuerySchema,
} from "@/features/platform-routes/files/schema"
import { accessFileByKey } from "@/features/platform-routes/files/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

/**
 * GET /api/files/[...key] - Get file access URL or redirect to presigned URL
 *
 * The key is the full S3 path, e.g., /api/files/documents/org123/doc456/file.pdf
 *
 * Query params:
 * - redirect=true (default): Redirect to presigned URL
 * - redirect=false: Return JSON with presigned URL
 * - download=true: Force download (Content-Disposition: attachment)
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
    const orgContext = await getOrganizationContext(request, session.user.id)

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

    if (result.shouldRedirect) {
      return NextResponse.redirect(result.url, 302)
    }

    return NextResponse.json({
      url: result.url,
      filename: result.filename,
      contentType: result.contentType,
      size: result.size,
      expiresAt: result.expiresAt,
    })
  } catch (error) {
    console.error("[Files API] Error:", error)
    return NextResponse.json({ error: "Failed to access file" }, { status: 500 })
  }
}
