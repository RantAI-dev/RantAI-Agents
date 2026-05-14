import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import {
  KnowledgeDocumentIdParamsSchema,
  KnowledgeDocumentUpdateSchema,
} from "@/features/knowledge/documents/schema"
import {
  deleteKnowledgeDocumentForDashboard,
  getKnowledgeDocumentForDashboard,
  updateKnowledgeDocumentForDashboard,
} from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Get a single document with chunks
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

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to get document:", error)
    return NextResponse.json({ error: "Failed to get document" }, { status: 500 })
  }
}

// PUT - Update document metadata, categories, and groups
export async function PUT(request: Request, { params }: RouteParams) {
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
    const parsedBody = KnowledgeDocumentUpdateSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const result = await updateKnowledgeDocumentForDashboard({
      documentId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.role ?? null,
      userId: session.user.id,
      input: parsedBody.data,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to update document:", error)
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 })
  }
}

// DELETE - Soft-delete by default (recoverable). Pass ?hard=true for permanent
// removal (S3 + SurrealDB chunks + Postgres row).
export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeDocumentIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 })
    }

    const url = new URL(request.url)
    const hard = url.searchParams.get("hard") === "true"

    const orgContext = await resolveActiveOrg(request, session.user.id)
    const result = await deleteKnowledgeDocumentForDashboard({
      documentId: parsedParams.data.id,
      organizationId: orgContext?.organizationId ?? null,
      role: orgContext?.role ?? null,
      userId: session.user.id,
      hard,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to delete document:", error)
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
  }
}
