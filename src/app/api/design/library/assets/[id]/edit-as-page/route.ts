import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { editLibraryAssetAsPage } from "@/design/server/library-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/design/library/assets/[id]/edit-as-page
//
// Daemon shape (apps/daemon/src/routes/library.ts
// `POST /api/library/assets/:id/edit-as-page`): returns
// `{ projectId, conversationId, relPath }`. Turns a captured `html` asset into a
// brand-new editable project whose `index.html` is the captured page, seeds a
// conversation, and back-links the asset to the new project. Scoped to caller.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  const outcome = await editLibraryAssetAsPage(gate.ctx, id)
  if (!outcome.ok) {
    if (outcome.reason === "asset-not-found") {
      return apiError(404, "NOT_FOUND", "asset not found")
    }
    if (outcome.reason === "not-html") {
      return apiError(
        400,
        "NOT_HTML",
        "only html captures can be opened as an editable page",
      )
    }
    return apiError(500, "EDIT_AS_PAGE_FAILED", "asset bytes not available")
  }
  return NextResponse.json({
    projectId: outcome.projectId,
    conversationId: outcome.conversationId,
    relPath: outcome.relPath,
  })
}
