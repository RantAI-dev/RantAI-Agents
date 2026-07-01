import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  prefillGenuiSurface,
  type GenuiSurfaceKind,
  type GenuiSurfaceTier,
} from "@/design/server/genui-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string }> }

const KINDS: GenuiSurfaceKind[] = ["form", "choice", "confirmation", "oauth-prompt"]
const TIERS: GenuiSurfaceTier[] = ["run", "conversation", "project"]

// POST /api/design/projects/[id]/genui/prefill
//
// Daemon shape (apps/daemon/src/routes/genui.ts
// `POST /api/projects/:projectId/genui/prefill`): body
// `{ surfaceId, kind?, persist?, value?, schema?, expiresAt?, snapshotId? }`,
// returns `{ ok: true, surface }`. Pre-answers a surface so a later lookup hits
// the cache. `snapshotId` is optional here (the cloud port persists user-driven
// surface state without a plugin snapshot; see genui-store.ts).
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
  const surfaceId = typeof body.surfaceId === "string" ? body.surfaceId : ""
  if (!surfaceId) {
    return apiError(400, "BAD_REQUEST", "surfaceId is required")
  }
  const kind =
    typeof body.kind === "string" && KINDS.includes(body.kind as GenuiSurfaceKind)
      ? (body.kind as GenuiSurfaceKind)
      : "confirmation"
  const persist =
    typeof body.persist === "string" && TIERS.includes(body.persist as GenuiSurfaceTier)
      ? (body.persist as GenuiSurfaceTier)
      : "project"

  const surface = await prefillGenuiSurface(gate.ctx, id, {
    surfaceId,
    kind,
    persist,
    value: "value" in body ? body.value : null,
    schema: body.schema,
    conversationId:
      typeof body.conversationId === "string" ? body.conversationId : null,
    pluginSnapshotId:
      typeof body.snapshotId === "string" ? body.snapshotId : null,
    expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
  })
  if (surface === null) {
    return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  }
  return NextResponse.json({ ok: true, surface })
}
