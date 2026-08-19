import { NextResponse } from "next/server"

import { getKnowledgeDocumentForDashboard } from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { userIdFromMobileToken } from "@/lib/mobile-auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { downloadFile } from "@/lib/s3"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/mobile/knowledge/documents/[id]/file — stream the original file bytes
 * through the app server (so the phone never hits the internal S3 host). Mainly
 * for image documents. Accepts the token via header or `?token=` (RN <Image>
 * can't reliably send auth headers). `?download=1` forces an attachment.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const url = new URL(request.url)
  const header = request.headers.get("authorization")
  const rawToken = header?.startsWith("Bearer ")
    ? header.slice(7)
    : url.searchParams.get("token")

  const userId = rawToken ? await userIdFromMobileToken(rawToken) : null
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const org = await resolveActiveOrg(request, userId)
  const { id } = await params

  const doc = await getKnowledgeDocumentForDashboard({
    documentId: id,
    organizationId: org?.organizationId ?? null,
  })
  if (isHttpServiceError(doc)) {
    return NextResponse.json({ error: doc.error }, { status: doc.status })
  }

  const detail = doc as { s3Key?: string | null; mimeType?: string | null }
  if (!detail.s3Key) {
    return NextResponse.json({ error: "No file for this document" }, { status: 404 })
  }

  try {
    const bytes = await downloadFile(detail.s3Key)
    const contentType = detail.mimeType || "application/octet-stream"
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    }
    if (url.searchParams.get("download") === "1") {
      const ext = contentType.split("/")[1]?.split(";")[0] ?? "bin"
      headers["Content-Disposition"] = `attachment; filename="${id}.${ext}"`
    }
    return new NextResponse(new Uint8Array(bytes), { headers })
  } catch (error) {
    console.error("[Mobile Knowledge] file proxy error:", error)
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 })
  }
}
