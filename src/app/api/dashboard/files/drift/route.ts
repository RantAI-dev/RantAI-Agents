import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { checkEmbeddingDrift } from "@/lib/rag/embedding-drift"

/**
 * GET /api/dashboard/files/drift
 *
 * Returns counts of document_chunk rows by their stored embedding_model field,
 * and flags how many are stale vs the currently-configured KB_EMBEDDING_MODEL.
 *
 * Drives the decision to run a bulk re-embed after swapping the embedding
 * model env var.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const report = await checkEmbeddingDrift()
    return NextResponse.json(report)
  } catch (error) {
    console.error("Failed to compute embedding drift:", error)
    return NextResponse.json({ error: "Failed to compute embedding drift" }, { status: 500 })
  }
}
