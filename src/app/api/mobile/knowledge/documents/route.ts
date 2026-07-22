import { NextResponse } from "next/server"

import {
  KnowledgeDocumentCreateSchema,
  KnowledgeDocumentListQuerySchema,
} from "@/features/knowledge/documents/schema"
import {
  createKnowledgeDocumentForDashboard,
  listKnowledgeDocumentsForDashboard,
} from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

// Document ingestion (extract + OCR + chunk + embed) is synchronous and can be
// slow for large/scanned files — give the route plenty of headroom.
export const maxDuration = 600

function parseList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value.length === 0) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((e): e is string => typeof e === "string" && e.length > 0)
    }
  } catch {
    return value.split(",").filter(Boolean)
  }
  return value.split(",").filter(Boolean)
}

/** GET /api/mobile/knowledge/documents?groupId= — list documents (lightweight). */
export async function GET(request: Request) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsedQuery = KnowledgeDocumentListQuerySchema.safeParse({
    groupId: new URL(request.url).searchParams.get("groupId") || undefined,
  })
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 })
  }

  try {
    const documents = await listKnowledgeDocumentsForDashboard({
      organizationId: ctx.organizationId,
      groupId: parsedQuery.data.groupId ?? null,
    })
    return NextResponse.json({ documents })
  } catch (error) {
    console.error("[Mobile Knowledge] list documents error:", error)
    return NextResponse.json({ error: "Failed to list documents" }, { status: 500 })
  }
}

/**
 * POST /api/mobile/knowledge/documents — upload a file (multipart) or raw JSON
 * document. Synchronous ingestion; the response returns once processing is done.
 */
export async function POST(request: Request) {
  const ctx = await getMobileContext(request)
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const context = { userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.role }
  const contentType = request.headers.get("content-type") || ""

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("file") as File | null
      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

      const result = await createKnowledgeDocumentForDashboard({
        context,
        input: {
          kind: "file",
          file,
          title: (formData.get("title") as string | null) ?? undefined,
          categories: parseList(formData.get("categories")),
          subcategory: (formData.get("subcategory") as string | null) ?? undefined,
          groupIds: parseList(formData.get("groupIds")),
          useEnhanced: false,
          useCombined: true,
          forceOCR: formData.get("forceOCR") === "true",
          documentType: (formData.get("documentType") as string | null) ?? undefined,
        },
      })
      if (isHttpServiceError(result)) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      return NextResponse.json(result)
    }

    const parsed = KnowledgeDocumentCreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const result = await createKnowledgeDocumentForDashboard({
      context,
      input: {
        kind: "json",
        title: parsed.data.title,
        content: parsed.data.content,
        categories: parsed.data.categories,
        subcategory: parsed.data.subcategory,
        groupIds: Array.isArray(parsed.data.groupIds) ? parsed.data.groupIds : [],
        useEnhanced: false,
        useCombined: true,
      },
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Knowledge] create document error:", error)
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 })
  }
}
