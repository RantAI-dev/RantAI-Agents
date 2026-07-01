import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { applyLibraryAssetToProject } from "@/design/server/library-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/design/library/assets/[id]/apply
//
// Daemon shape (apps/daemon/src/routes/library.ts
// `POST /api/library/assets/:id/apply`): body `{ projectId, dir?, includeElement? }`,
// returns `{ relPath, elementRelPath? }`. Copies the asset's owned bytes into the
// target project's files (default `library/` subdir) and records a provenance
// back-link. Both the asset and the target project are scoped to the caller.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : ""
  if (!projectId) {
    return apiError(400, "BAD_REQUEST", "projectId is required")
  }

  const outcome = await applyLibraryAssetToProject(gate.ctx, id, projectId, {
    dir: typeof body.dir === "string" ? body.dir : undefined,
    includeElement: body.includeElement === true,
    sourceKind: "manual-upload",
  })
  if (!outcome.ok) {
    if (outcome.reason === "asset-not-found") {
      return apiError(404, "NOT_FOUND", "asset not found")
    }
    if (outcome.reason === "project-not-found") {
      return apiError(404, "PROJECT_NOT_FOUND", "project not found")
    }
    return apiError(500, "APPLY_FAILED", "asset bytes not available")
  }
  return NextResponse.json({
    relPath: outcome.relPath,
    ...(outcome.elementRelPath ? { elementRelPath: outcome.elementRelPath } : {}),
  })
}
