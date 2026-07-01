import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import { getDesignFile } from "@/design/server/storage"
import {
  buildStoredZip,
  sanitizeArchiveFilename,
  type ZipInput,
} from "@/design/server/archive"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/design/projects/[id]/archive/batch  { files: string[] }
//
// Daemon shape (apps/daemon/src/import-export-routes.ts +
// projects.ts:buildBatchArchive): returns a ZIP of ONLY the named files, used by
// the Design Files panel's multi-select "Download selected" action. Unlike the
// full-project archive it appends no handoff/manifest — just the chosen files.
// Hidden-segment paths + `.artifact.json` sidecars are rejected (mirrors the
// daemon's visibility allowlist). The cloud port fetches the bytes from S3.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")

  let body: { files?: unknown }
  try {
    body = (await req.json()) as { files?: unknown }
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }
  const files = body.files
  if (!Array.isArray(files) || files.length === 0) {
    return apiError(400, "BAD_REQUEST", "files must be a non-empty array")
  }

  try {
    const inputs: ZipInput[] = []
    for (const raw of files) {
      if (typeof raw !== "string") continue
      const name = raw.replace(/^\/+/, "")
      const segs = name.split("/")
      // Mirror the daemon's allowlist: no hidden segments, no artifact sidecars.
      if (!name || segs.some((s) => s.startsWith("."))) continue
      if (name.endsWith(".artifact.json")) continue
      try {
        const buffer = await getDesignFile(gate.ctx, id, name)
        inputs.push({ path: name, bytes: new Uint8Array(buffer) })
      } catch {
        // File missing / unreadable — skip it (daemon records it as rejected).
      }
    }

    if (inputs.length === 0) {
      return apiError(404, "FILE_NOT_FOUND", "no eligible files to archive")
    }

    const buffer = buildStoredZip(inputs)
    const fileSlug = sanitizeArchiveFilename(project.name || id) || "project"
    const filename = `${fileSlug}.zip`
    const asciiFallback =
      filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "_") || "project.zip"

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    return apiError(400, "BAD_REQUEST", String(err))
  }
}
