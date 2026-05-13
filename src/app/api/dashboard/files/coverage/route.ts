import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { listColdDocuments } from "@/features/knowledge/documents/repository"

/**
 * GET /api/dashboard/files/coverage?staleAfterDays=30&limit=100
 *
 * Returns "cold" knowledge documents — those that have never surfaced in RAG
 * retrieval (retrievalCount=0) or whose lastRetrievedAt is older than the
 * threshold. Signal for KB curation: cull dead docs, fix discoverability of
 * docs that should be hit but aren't.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const staleAfterDaysParam = url.searchParams.get("staleAfterDays")
  const limitParam = url.searchParams.get("limit")
  const staleAfterDays = staleAfterDaysParam ? parseInt(staleAfterDaysParam, 10) : undefined
  const limit = limitParam ? parseInt(limitParam, 10) : 100

  try {
    const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
    const docs = await listColdDocuments({
      organizationId: orgContext?.organizationId ?? null,
      staleAfterDays: Number.isFinite(staleAfterDays) ? staleAfterDays : undefined,
      limit: Number.isFinite(limit) ? limit : 100,
    })
    return NextResponse.json({ documents: docs })
  } catch (error) {
    console.error("Failed to list cold documents:", error)
    return NextResponse.json({ error: "Failed to list cold documents" }, { status: 500 })
  }
}
