import { NextResponse } from "next/server"
import type {
  DeleteProjectFolderResponse,
  ProjectFolderResponse,
  ProjectFoldersResponse,
} from "@open-design/contracts"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import {
  createProjectFolderInS3,
  deleteProjectFolderFromS3,
  listProjectFoldersFromS3,
} from "../../../_lib/project-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

// GET/POST/DELETE /api/design/projects/[id]/folders
//   (SPA fetches /api/projects/:id/folders, rewritten → here.)
//
// Daemon shape (apps/daemon/src/routes/project/index.ts): folders were real
// on-disk directories. GET → `{ folders: ProjectFolder[] }`, POST `{ name }` →
// `{ folder }`, DELETE `{ path }` → `{ ok: true }`. S3 has no directories, so
// the cloud port DERIVES folders from key prefixes and persists an empty folder
// as a zero-byte marker (see _lib/project-files.ts).
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  try {
    const folders = await listProjectFoldersFromS3(gate.ctx, id)
    const body: ProjectFoldersResponse = { folders }
    return NextResponse.json(body)
  } catch (err) {
    return apiError(400, "BAD_REQUEST", String(err))
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  let name: unknown
  try {
    ;({ name } = (await req.json()) as { name?: unknown })
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }
  if (typeof name !== "string" || !name.trim()) {
    return apiError(400, "BAD_REQUEST", "name required")
  }
  try {
    const folder = await createProjectFolderInS3(gate.ctx, id, name)
    const body: ProjectFolderResponse = { folder }
    return NextResponse.json(body)
  } catch (err) {
    return apiError(400, "BAD_REQUEST", String(err))
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  let path: unknown
  try {
    ;({ path } = (await req.json()) as { path?: unknown })
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }
  if (typeof path !== "string" || !path.trim()) {
    return apiError(400, "BAD_REQUEST", "path required")
  }
  try {
    await deleteProjectFolderFromS3(gate.ctx, id, path)
    const body: DeleteProjectFolderResponse = { ok: true }
    return NextResponse.json(body)
  } catch (err) {
    return apiError(400, "BAD_REQUEST", String(err))
  }
}
