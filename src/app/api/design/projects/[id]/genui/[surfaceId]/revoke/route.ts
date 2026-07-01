import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { revokeGenuiSurface } from "@/design/server/genui-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string; surfaceId: string }> }

// POST /api/design/projects/[id]/genui/[surfaceId]/revoke
//
// Daemon shape (apps/daemon/src/routes/genui.ts
// `POST /api/projects/:projectId/genui/:surfaceId/revoke`): `{ ok, invalidated }`.
// Flips every matching non-invalidated surface row to `invalidated` so the next
// run re-asks the user. Scoped: the project must be owned by the caller.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, surfaceId } = await params
  const invalidated = await revokeGenuiSurface(gate.ctx, id, surfaceId)
  if (invalidated === null) {
    return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  }
  return NextResponse.json({ ok: true, invalidated })
}
