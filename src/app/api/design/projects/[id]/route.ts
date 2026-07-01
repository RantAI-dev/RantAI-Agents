import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  deleteDesignProject,
  getDesignProject,
  updateDesignProject,
  type UpdateDesignProjectInput,
} from "@/design/server/projects-store"

const MAX_CUSTOM_INSTRUCTIONS_LEN = 5000

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]
//
// Daemon shape (apps/daemon/src/routes/project/index.ts): `{ project, resolvedDir }`.
// `resolvedDir` is a daemon filesystem path with no cloud analogue, so it's null
// (the SPA falls back to `metadata.baseDir ?? null`).
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "not found")
  return NextResponse.json({ project, resolvedDir: null })
}

// PATCH /api/design/projects/[id]
//
// Daemon shape: `{ project }`. Accepts the UpdateProjectRequest subset the SPA
// sends. Filesystem-privileged metadata guards (baseDir/import state) from the
// daemon are dropped — cloud projects have no on-disk root.
export async function PATCH(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const patch: UpdateDesignProjectInput = {}
  if (typeof body.name === "string") patch.name = body.name
  if ("skillId" in body) {
    patch.skillId = typeof body.skillId === "string" ? body.skillId : null
  }
  if ("designSystemId" in body) {
    patch.designSystemId =
      typeof body.designSystemId === "string" ? body.designSystemId : null
  }
  if ("pendingPrompt" in body) {
    patch.pendingPrompt =
      typeof body.pendingPrompt === "string" ? body.pendingPrompt : null
  }
  if ("metadata" in body) patch.metadata = body.metadata
  if ("customInstructions" in body) {
    const ci = body.customInstructions
    if (ci !== null && typeof ci !== "string") {
      return apiError(400, "BAD_REQUEST", "customInstructions must be a string or null")
    }
    if (typeof ci === "string" && ci.length > MAX_CUSTOM_INSTRUCTIONS_LEN) {
      return apiError(400, "BAD_REQUEST", "customInstructions exceeds 5 000 character limit")
    }
    patch.customInstructions = ci
  }

  const project = await updateDesignProject(gate.ctx, id, patch)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "not found")
  return NextResponse.json({ project })
}

// DELETE /api/design/projects/[id]
//
// Daemon shape: `{ ok: true }` (idempotent — the daemon returns ok even when the
// row is already gone). Prisma relations cascade to conversations/tabs/etc.
export async function DELETE(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  await deleteDesignProject(gate.ctx, id)
  return NextResponse.json({ ok: true })
}
