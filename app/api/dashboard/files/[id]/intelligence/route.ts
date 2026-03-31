import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { KnowledgeDocumentIntelligenceParamsSchema } from "@/src/features/knowledge/documents/schema"
import { getKnowledgeDocumentIntelligence } from "@/src/features/knowledge/documents/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - Fetch entities and relations for a document
export async function GET(_request: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsedParams = KnowledgeDocumentIntelligenceParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 })
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
