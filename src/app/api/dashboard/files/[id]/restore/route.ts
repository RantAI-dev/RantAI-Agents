import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { KnowledgeDocumentIdParamsSchema } from "@/features/knowledge/documents/schema"
import { restoreKnowledgeDocumentForDashboard } from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST - Restore a soft-deleted document back to active state.
export async function POST(request: Request, { params }: RouteParams) {
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
    const result = await restoreKnowledgeDocumentForDashboard({
      documentId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.role ?? null,
      userId: session.user.id,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to restore document:", error)
    return NextResponse.json({ error: "Failed to restore document" }, { status: 500 })
  }
}
