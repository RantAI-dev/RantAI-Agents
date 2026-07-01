import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import { getDesignFile } from "@/design/server/storage"
import { mimeFor } from "../../../../_lib/project-files"

type RouteParams = { params: Promise<{ id: string; name: string[] }> }

// GET /api/design/projects/[id]/files/<relPath>
//
// Daemon shape (apps/daemon/src/routes/project/index.ts, regex
// `/api/projects/:id/files/(.+)`): raw file bytes with the extension-derived
// Content-Type. The SPA reads DESIGN.md this way (`.text()`), so it must return
// the body, not JSON. 404 when the project isn't owned or the file is missing.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, name } = await params
  const relPath = (name ?? []).join("/")

  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")

  try {
    const buffer = await getDesignFile(gate.ctx, id, relPath)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeFor(relPath),
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return apiError(404, "FILE_NOT_FOUND", "file not found")
  }
}
