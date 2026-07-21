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
 * GET /api/dashboard/files/:id/asset?key=... — stream a cropped figure asset
 * (multimodal RAG) through the app. Like the /raw route, this avoids handing
 * the browser presigned URLs against the internal object store. The requested
 * key MUST live under this document's asset prefix (IDOR guard).
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
    const key = new URL(request.url).searchParams.get("key")
    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 })
    }

    const orgContext = await resolveActiveOrg(request, session.user.id)
    const doc = await getKnowledgeDocumentForDashboard({
      documentId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(doc)) {
      return NextResponse.json({ error: doc.error }, { status: doc.status })
    }

    // IDOR guard: the asset key must belong to THIS document's asset folder.
    const orgSeg = orgContext?.organizationId || "global"
    const expectedPrefix = `documents/${orgSeg}/${parsedParams.data.id}/assets/`
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Asset not in this document" }, { status: 403 })
    }

    const buffer = await downloadFile(key)
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error) {
    console.error("Failed to stream document asset:", error)
    return NextResponse.json({ error: "Failed to load asset" }, { status: 500 })
  }
}
