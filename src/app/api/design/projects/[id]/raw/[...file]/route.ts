import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import { getDesignFile } from "@/design/server/storage"
import { mimeFor } from "../../../../_lib/project-files"

type RouteParams = { params: Promise<{ id: string; file: string[] }> }

// GET /api/design/projects/[id]/raw/<relPath>
//
// Daemon shape (apps/daemon/src/routes/project/index.ts, regex
// `/api/projects/:id/raw/(.+)`): raw file bytes with the extension-derived
// Content-Type — the URL-load path for artifact/file previews (see the SPA's
// `buildProjectRawFileUrl`). The daemon's srcDoc bridge injection + Vite-dist
// rewrite are preview-only concerns not needed to serve the bytes. 404 when the
// project isn't owned or the file is missing.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, file } = await params
  const relPath = (file ?? []).join("/")

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
