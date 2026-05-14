import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { KnowledgeDocumentIdParamsSchema, KnowledgeDocumentCreateSchema } from "@/features/knowledge/documents/schema"
import { replaceKnowledgeDocumentContentForDashboard } from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/dashboard/files/[id]/replace-content
 *
 * Replace a document's content in place. Multipart form same as the create
 * endpoint (file OR title+content). The Document.id stays stable — groups,
 * sessions, assistant bindings, and audit history all survive the swap. Old
 * chunks + entities + S3 file are cleaned up; new chunks are re-embedded.
 */
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

    const formData = await request.formData()
    const fileEntry = formData.get("file")
    const file = fileEntry instanceof File ? fileEntry : undefined
    const titleEntry = formData.get("title")
    const contentEntry = formData.get("content")
    const categoriesEntry = formData.get("categories")
    const subcategoryEntry = formData.get("subcategory")
    const groupIdsEntry = formData.get("groupIds")
    const forceOCREntry = formData.get("forceOCR")

    const parsedInput = KnowledgeDocumentCreateSchema.safeParse({
      title: typeof titleEntry === "string" ? titleEntry : undefined,
      content: typeof contentEntry === "string" ? contentEntry : undefined,
      categories: typeof categoriesEntry === "string" ? JSON.parse(categoriesEntry) : undefined,
      subcategory: typeof subcategoryEntry === "string" ? subcategoryEntry : undefined,
      groupIds: typeof groupIdsEntry === "string" ? JSON.parse(groupIdsEntry) : undefined,
    })
    if (!parsedInput.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedInput.error.flatten() }, { status: 400 })
    }

    const url = new URL(request.url)
    const useEnhanced = url.searchParams.get("enhanced") === "true"
    const useCombined = url.searchParams.get("combined") !== "false"

    const orgContext = await resolveActiveOrg(request, session.user.id)
    const result = await replaceKnowledgeDocumentContentForDashboard({
      context: {
        userId: session.user.id,
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.role ?? null,
      },
      documentId: parsedParams.data.id,
      input: {
        ...parsedInput.data,
        kind: file ? "file" : "json",
        file,
        useEnhanced,
        useCombined,
        forceOCR: forceOCREntry === "true",
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to replace document content:", error)
    return NextResponse.json({ error: "Failed to replace document content" }, { status: 500 })
  }
}
