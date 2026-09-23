import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { KnowledgeDocumentIntelligenceParamsSchema } from "@/features/knowledge/documents/schema"
import {
  getKnowledgeDocumentForDashboard,
  getKnowledgeDocumentIntelligence,
} from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Fetch entities and relations for a document
export async function GET(request: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeDocumentIntelligenceParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 })
    }

    // SECURITY: authorise against the caller's organization BEFORE reading the
    // graph. getKnowledgeDocumentIntelligence queries SurrealDB by document_id
    // alone, and SurrealDB rows carry no organization — it relies on its
    // caller to have checked ownership. The mobile route and the agent-API KB
    // surface both do; this route did not, so any signed-in user could read
    // any organization's entities and relations by supplying a document id.
    // Same check, same order and same 404 as the mobile route.
    const orgContext = await resolveActiveOrg(request, session.user.id)
    const doc = await getKnowledgeDocumentForDashboard({
      documentId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isHttpServiceError(doc)) {
      return NextResponse.json({ error: doc.error }, { status: doc.status })
    }

    const result = await getKnowledgeDocumentIntelligence({
      documentId: parsedParams.data.id,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch document intelligence:", error)
    return NextResponse.json({ error: "Failed to fetch document intelligence" }, { status: 500 })
  }
}
