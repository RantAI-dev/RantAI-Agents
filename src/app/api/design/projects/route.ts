import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  createDesignProject,
  isSafeId,
  listDesignProjects,
} from "@/design/server/projects-store"

const MAX_CUSTOM_INSTRUCTIONS_LEN = 5000

// GET /api/design/projects
//
// Daemon shape (apps/daemon/src/routes/project/index.ts): `{ projects: Project[] }`,
// each project carrying a derived `status`. Scoped to the caller's
// { userId, organizationId }.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const projects = await listDesignProjects(gate.ctx)
  return NextResponse.json({ projects })
}

// POST /api/design/projects
//
// Daemon shape: `{ project, conversationId, appliedPluginSnapshotId? }`. The SPA
// sends `{ id, name, ...CreateProjectRequest }` (client-generated id). We
// validate id/name/customInstructions the way the daemon does, then create the
// project + seed its default conversation.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const { id, name } = body
  if (!isSafeId(id)) return apiError(400, "BAD_REQUEST", "invalid project id")
  if (typeof name !== "string" || !name.trim()) {
    return apiError(400, "BAD_REQUEST", "name required")
  }

  const customInstructions = body.customInstructions
  if (
    customInstructions !== undefined &&
    customInstructions !== null &&
    typeof customInstructions !== "string"
  ) {
    return apiError(400, "BAD_REQUEST", "customInstructions must be a string or null")
  }
  if (
    typeof customInstructions === "string" &&
    customInstructions.length > MAX_CUSTOM_INSTRUCTIONS_LEN
  ) {
    return apiError(400, "BAD_REQUEST", "customInstructions exceeds 5 000 character limit")
  }

  try {
    const result = await createDesignProject(gate.ctx, {
      id,
      name,
      skillId: typeof body.skillId === "string" ? body.skillId : null,
      designSystemId:
        typeof body.designSystemId === "string" ? body.designSystemId : null,
      pendingPrompt:
        typeof body.pendingPrompt === "string" ? body.pendingPrompt : null,
      metadata: body.metadata,
      customInstructions:
        typeof customInstructions === "string" ? customInstructions : null,
    })
    return NextResponse.json(result)
  } catch (err) {
    // Mirrors the daemon's 400 on create failure (e.g. duplicate id).
    return apiError(400, "BAD_REQUEST", String(err))
  }
}
