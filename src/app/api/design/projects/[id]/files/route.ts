import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import { putDesignFile } from "@/design/server/storage"
import type { ProjectFile } from "@open-design/contracts"
import {
  kindFor,
  listProjectFilesFromS3,
  mimeFor,
} from "../../../_lib/project-files"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/files
//
// Daemon shape (apps/daemon/src/routes/project/index.ts): `{ files: ProjectFile[] }`.
// Files are stored in S3 (design/{orgId|global}/{projectId}/…) and the daemon's
// disk-derived kind/mime + optional `?since=` mtime floor are reconstructed here.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")

  const sinceRaw = new URL(req.url).searchParams.get("since")
  const since = sinceRaw != null ? Number(sinceRaw) : undefined
  try {
    const files = await listProjectFilesFromS3(gate.ctx, id, {
      since: Number.isFinite(since) ? since : undefined,
    })
    return NextResponse.json({ files })
  } catch (err) {
    return apiError(400, "BAD_REQUEST", String(err))
  }
}

// POST /api/design/projects/[id]/files
//
// Daemon shape: `{ file: ProjectFile }`. Two request forms, matching the SPA:
//   - multipart/form-data with a `file` (binary uploads), optional `name`.
//   - JSON `{ name, content, encoding? }` (text / base64 sketches + artifacts).
// The daemon's artifact-manifest validation + stub-guard regression checks are
// disk/DB-backed and are not ported here (S3-only persistence).
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")

  const contentType = req.headers.get("content-type") ?? ""

  try {
    let name: string
    let buffer: Buffer

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      const file = form.get("file")
      if (!(file instanceof File)) {
        return apiError(400, "BAD_REQUEST", "file field required")
      }
      const desired = form.get("name")
      name = typeof desired === "string" && desired ? desired : file.name
      buffer = Buffer.from(await file.arrayBuffer())
    } else {
      let body: Record<string, unknown>
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        return apiError(400, "BAD_REQUEST", "invalid JSON body")
      }
      const { name: n, content, encoding } = body
      if (typeof n !== "string" || typeof content !== "string") {
        return apiError(400, "BAD_REQUEST", "name and content required")
      }
      name = n
      buffer =
        encoding === "base64"
          ? Buffer.from(content, "base64")
          : Buffer.from(content, "utf8")
    }

    const mime = mimeFor(name)
    const result = await putDesignFile(gate.ctx, id, name, buffer, mime)
    const file: ProjectFile = {
      name,
      path: name,
      type: "file",
      size: result.size,
      mtime: Date.now(),
      kind: kindFor(name),
      mime,
    }
    return NextResponse.json({ file })
  } catch (err) {
    return apiError(500, "INTERNAL_ERROR", `upload failed: ${String(err)}`)
  }
}
