import { NextResponse } from "next/server"

import { KnowledgeDocumentIdParamsSchema } from "@/features/knowledge/documents/schema"
import {
  getKnowledgeDocumentForDashboard,
  getKnowledgeDocumentIntelligence,
} from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/mobile/knowledge/documents/[id]/intelligence — the document's
 * extracted entities + relations (from SurrealDB). Org access is enforced via
 * the document first.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = KnowledgeDocumentIdParamsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: "Invalid document id" }, { status: 400 })

  // Authorize: the document must be visible to the caller's org.
  const doc = await getKnowledgeDocumentForDashboard({
    documentId: parsed.data.id,
    organizationId: ctx.organizationId,
  })
  if (isHttpServiceError(doc)) {
    return NextResponse.json({ error: doc.error }, { status: doc.status })
  }

  try {
    const result = await getKnowledgeDocumentIntelligence({ documentId: parsed.data.id })
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Knowledge] intelligence error:", error)
    return NextResponse.json({ error: "Failed to fetch document intelligence" }, { status: 500 })
  }
}
