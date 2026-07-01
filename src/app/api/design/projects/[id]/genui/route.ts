import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { listGenuiSurfacesForProject } from "@/design/server/genui-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/genui
//
// Daemon shape (apps/daemon/src/routes/genui.ts
// `GET /api/projects/:projectId/genui`): `{ projectId, surfaces }`. Lists every
// persisted GenUI surface for the project (project / conversation tier) so the
// GenUI Inbox can show — and revoke — remembered plugin answers. Scoped: the
// project must be owned by the caller.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const surfaces = await listGenuiSurfacesForProject(gate.ctx, id)
  if (surfaces === null) {
    return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  }
  return NextResponse.json({ projectId: id, surfaces })
}
