import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import { createKnowledgeDocumentForDashboard } from "@/features/knowledge/documents/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

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

interface BulkResult {
  filename: string
  success: boolean
  documentId?: string
  error?: string
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const orgContext = await resolveActiveOrg(request, session.user.id)
    const searchParams = new URL(request.url).searchParams
    const useEnhanced = searchParams.get("enhanced") !== "false"
    const useCombined = searchParams.get("combined") !== "false"

    const contentType = request.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 400 })
    }

    const formData = await request.formData()
    const files = formData.getAll("files") as File[]
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 })
    }

    const titles = parseDelimitedList(formData.get("titles"))
    const categories = parseDelimitedList(formData.get("categories"))
    const subcategory = formData.get("subcategory") as string | undefined
    const groupIds = parseDelimitedList(formData.get("groupIds"))
    const forceOCRParam = searchParams.get("forceOCR")
    const forceOCRField = formData.get("forceOCR") as string | null
    const forceOCR = forceOCRParam === "true" || forceOCRField === "true"

    const results: BulkResult[] = []
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const title = titles[i] || file.name.replace(/\.[^/.]+$/, "")

      const result = await createKnowledgeDocumentForDashboard({
        context: {
          userId: session.user.id,
          organizationId: orgContext?.organizationId ?? null,
          role: orgContext?.role ?? null,
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
        },
      })

      if (isHttpServiceError(result)) {
        results.push({ filename: file.name, success: false, error: result.error })
        failed++
      } else {
        results.push({ filename: file.name, success: true, documentId: result.id })
        succeeded++
      }
    }

    return NextResponse.json({
      results,
      summary: { total: files.length, succeeded, failed },
    })
  } catch (error) {
    console.error("Failed to process bulk upload:", error)
    return NextResponse.json({ error: "Failed to process bulk upload" }, { status: 500 })
  }
}