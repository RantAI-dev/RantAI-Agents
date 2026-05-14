import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { bulkReEmbed } from "@/lib/rag/bulk-re-embed"

/**
 * POST /api/dashboard/files/bulk/re-embed
 * Body: { documentIds?: string[]; onlyStale?: boolean; concurrency?: number }
 *
 * Re-embeds chunks of selected documents (or all chunks whose embedding_model
 * doesn't match the current config when onlyStale=true) using the currently-
 * configured KB_EMBEDDING_MODEL. Returns a per-document summary.
 *
 * Scoped to the caller's organization — only docs visible to the org (own or
 * null/global) are eligible. Concurrency bounded server-side; the request
 * blocks until all targets are processed, so for large jobs run a few times
 * with documentIds slices or a small onlyStale page.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { documentIds?: unknown; onlyStale?: unknown; concurrency?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is fine — defaults to onlyStale: false with no ids = no-op.
  }

  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((x): x is string => typeof x === "string")
    : undefined
  const onlyStale = body.onlyStale === true
  const concurrency = typeof body.concurrency === "number" ? body.concurrency : undefined

  if (!documentIds?.length && !onlyStale) {
    return NextResponse.json(
      { error: "Provide documentIds[] or onlyStale: true" },
      { status: 400 }
    )
  }

  try {
    const orgContext = await getOrganizationContextWithFallback(request, session.user.id)
    const summary = await bulkReEmbed({
      documentIds,
      onlyStale,
      organizationId: orgContext?.organizationId ?? null,
      concurrency,
    })
    return NextResponse.json(summary)
  } catch (error) {
    console.error("Failed to bulk re-embed:", error)
    return NextResponse.json({ error: "Failed to bulk re-embed" }, { status: 500 })
  }
}
