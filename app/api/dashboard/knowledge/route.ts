import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  KnowledgeDocumentCreateSchema,
  KnowledgeDocumentListQuerySchema,
} from "@/src/features/knowledge/documents/schema"
import {
  createKnowledgeDocumentForDashboard,
  listKnowledgeDocumentsForDashboard,
} from "@/src/features/knowledge/documents/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
  }

  if (typeof value === "string" && value.length > 0) {
    return [value]
  }

  return []
}

function parseDelimitedList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    }
  } catch {
    return value.split(",").filter(Boolean)
  }

  return value.split(",").filter(Boolean)
}

// GET - List all documents
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await getOrganizationContext(request, session.user.id)
    const parsedQuery = KnowledgeDocumentListQuerySchema.safeParse({
      groupId: new URL(request.url).searchParams.get("groupId") || undefined,
    })

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedQuery.error.flatten() }, { status: 400 })
    }

    const documents = await listKnowledgeDocumentsForDashboard({
      organizationId: orgContext?.organizationId ?? null,
      groupId: parsedQuery.data.groupId ?? null,
    })

    return NextResponse.json({
      documents,
    })
  } catch (error) {
    console.error("Failed to list documents:", error)
    return NextResponse.json({ error: "Failed to list documents" }, { status: 500 })
  }
}

// POST - Create a new document
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await getOrganizationContext(request, session.user.id)
    const searchParams = new URL(request.url).searchParams
    const useEnhanced = searchParams.get("enhanced") === "true"
    const useCombined = searchParams.get("combined") !== "false"
    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("file") as File | null
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
      }

      const title = formData.get("title") as string | undefined
      const categories = parseDelimitedList(formData.get("categories"))
      const subcategory = formData.get("subcategory") as string | undefined
      const groupIds = parseDelimitedList(formData.get("groupIds"))
      const forceOCRParam = searchParams.get("forceOCR")
      const forceOCRField = formData.get("forceOCR") as string | null
      const forceOCR = forceOCRParam === "true" || forceOCRField === "true"
      const documentType = (formData.get("documentType") as string | null) || searchParams.get("documentType") || undefined

      const result = await createKnowledgeDocumentForDashboard({
        context: {
          userId: session.user.id,
          organizationId: orgContext?.organizationId ?? null,
          role: orgContext?.membership.role ?? null,
        },
        input: {
          kind: "file",
          file,
          title,
          categories,
          subcategory,
          groupIds,
          useEnhanced,
          useCombined,
          forceOCR,
          documentType,
        },
      })

      if (isHttpServiceError(result)) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      return NextResponse.json(result)
    }

    const parsedBody = KnowledgeDocumentCreateSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsedBody.error.flatten() }, { status: 400 })
    }

    const result = await createKnowledgeDocumentForDashboard({
      context: {
        userId: session.user.id,
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
      },
      input: {
        kind: "json",
        title: parsedBody.data.title,
        content: parsedBody.data.content,
        categories: parsedBody.data.categories,
        subcategory: parsedBody.data.subcategory,
        groupIds: toStringList(parsedBody.data.groupIds),
        useEnhanced,
        useCombined,
      },
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to create document:", error)
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 })
  }
}
