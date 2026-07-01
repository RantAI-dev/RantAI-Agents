import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import { getDesignFile } from "@/design/server/storage"
import {
  buildProjectArchive,
  isIgnoredProjectDirName,
  sanitizeArchiveFilename,
  type ArchiveFileEntry,
} from "@/design/server/archive"
import { listProjectFilesFromS3 } from "../../../_lib/project-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/archive?root=<subdir>
//
// Daemon shape (apps/daemon/src/import-export-routes.ts +
// projects.ts:buildProjectArchive): streams a ZIP of the project's file tree so
// the SPA's "Download as .zip" share menu (and the Design Files download button)
// hands the user the actual project files — not a one-file srcdoc snapshot. An
// optional `root` scopes the archive to a top-level subdirectory (entries are
// re-based relative to that root; the download name uses the root's basename).
// A `DESIGN-HANDOFF.md` + `DESIGN-MANIFEST.json` coding-handoff guide is appended
// (see src/design/server/archive.ts). The cloud port lists + fetches the bytes
// from S3 rather than walking a local PROJECTS_DIR.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")

  const rootRaw = new URL(req.url).searchParams.get("root") ?? ""
  const root = rootRaw.replace(/^\/+|\/+$/g, "").trim()

  try {
    const files = await listProjectFilesFromS3(gate.ctx, id)

    // Mirror the daemon's collectArchiveEntries visibility filter: drop any
    // path with a dotfile segment, `.artifact.json` sidecars, and any file
    // under an ignored generated/cache directory.
    const eligible = files.filter((f) => {
      const segs = f.name.split("/")
      if (segs.some((s) => s.startsWith("."))) return false
      if (f.name.endsWith(".artifact.json")) return false
      // Every directory segment (all but the basename) must be non-ignored.
      if (segs.slice(0, -1).some((s) => isIgnoredProjectDirName(s))) return false
      return true
    })

    // Scope to `root` when provided; entries are re-based relative to it.
    const scoped = root
      ? eligible
          .filter((f) => f.name === root || f.name.startsWith(`${root}/`))
          .map((f) => ({ ...f, name: f.name.slice(root.length + 1) }))
          .filter((f) => f.name.length > 0)
      : eligible

    if (scoped.length === 0) {
      return apiError(404, "FILE_NOT_FOUND", "archive root is empty")
    }

    const entries: ArchiveFileEntry[] = []
    for (const f of scoped) {
      // Fetch by the original (un-rebased) key. When scoped, prepend the root.
      const key = root ? `${root}/${f.name}` : f.name
      const buffer = await getDesignFile(gate.ctx, id, key)
      entries.push({
        relPath: f.name,
        bytes: new Uint8Array(buffer),
        mtime: f.mtime,
      })
    }

    const baseName = root ? root.slice(root.lastIndexOf("/") + 1) : ""
    const label = baseName || project.name || id
    const buffer = buildProjectArchive(entries, label)

    const fileSlug = sanitizeArchiveFilename(label) || "project"
    const filename = `${fileSlug}.zip`
    // RFC 5987: ASCII `filename=` fallback + UTF-8 `filename*=` so project
    // names with non-ASCII characters download without mojibake.
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
