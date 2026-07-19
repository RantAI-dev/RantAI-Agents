import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { KnowledgeDocumentIdParamsSchema } from "@/features/knowledge/documents/schema"
import { getKnowledgeDocumentForDashboard } from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { downloadFile } from "@/lib/s3"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/dashboard/files/:id/raw — stream the original uploaded file
 * (PDF/image/etc.) through the app. The browser must NEVER receive presigned
 * S3 URLs: the object store is an internal-only service (http://rustfs:9000),
 * so presigned links don't resolve outside the docker network — which is why
 * PDF previews rendered blank on self-hosted deployments.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeDocumentIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 })
    }

    const orgContext = await resolveActiveOrg(request, session.user.id)
    const result = await getKnowledgeDocumentForDashboard({
      documentId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const s3Key = (result as { s3Key?: string | null }).s3Key
    if (!s3Key) {
      return NextResponse.json({ error: "Document has no stored file" }, { status: 404 })
    }

    const buffer = await downloadFile(s3Key)
    const mimeType = (result as { mimeType?: string | null }).mimeType || "application/octet-stream"
    const filename = s3Key.split("/").pop() || "file"

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch (error) {
    console.error("Failed to stream document file:", error)
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 })
  }
}
