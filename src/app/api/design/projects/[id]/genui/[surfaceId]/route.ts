import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  getLatestGenuiSurface,
  putResolvedGenuiSurface,
  type GenuiSurfaceKind,
  type GenuiSurfaceTier,
} from "@/design/server/genui-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string; surfaceId: string }> }

const KINDS: GenuiSurfaceKind[] = ["form", "choice", "confirmation", "oauth-prompt"]
const TIERS: GenuiSurfaceTier[] = ["run", "conversation", "project"]

// GET /api/design/projects/[id]/genui/[surfaceId]
//
// Returns the latest persisted surface row for the `(projectId, surfaceId)`
// pair, or 404. Mirrors the daemon's single-surface read (project-scoped here,
// since runs are not ported).
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, surfaceId } = await params
  const surface = await getLatestGenuiSurface(gate.ctx, id, surfaceId)
  if (!surface) {
    return apiError(404, "NOT_FOUND", "surface not found")
  }
  return NextResponse.json(surface)
}

// PUT /api/design/projects/[id]/genui/[surfaceId]
//
// Idempotent persist of a surface's resolved value: updates the latest
// non-invalidated row for the pair in place, or inserts a fresh resolved row.
// Body: `{ value, kind?, persist?, conversationId?, schema?, expiresAt? }`.
// Returns `{ ok: true, surface }`.
export async function PUT(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, surfaceId } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const kind =
    typeof body.kind === "string" && KINDS.includes(body.kind as GenuiSurfaceKind)
      ? (body.kind as GenuiSurfaceKind)
      : undefined
  const persist =
    typeof body.persist === "string" && TIERS.includes(body.persist as GenuiSurfaceTier)
      ? (body.persist as GenuiSurfaceTier)
      : undefined

  const surface = await putResolvedGenuiSurface(gate.ctx, id, {
    surfaceId,
    value: "value" in body ? body.value : null,
    ...(kind !== undefined ? { kind } : {}),
    ...(persist !== undefined ? { persist } : {}),
    ...(typeof body.conversationId === "string"
      ? { conversationId: body.conversationId }
      : {}),
    ...("schema" in body ? { schema: body.schema } : {}),
    ...(typeof body.expiresAt === "number" ? { expiresAt: body.expiresAt } : {}),
  })
  if (surface === null) {
    return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  }
  return NextResponse.json({ ok: true, surface })
}
