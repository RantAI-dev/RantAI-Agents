import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import { getDesignFile } from "@/design/server/storage"
import {
  inlineRelativeAssets,
  InlineAssetsLimitError,
  MAX_INLINE_OWNER_BYTES,
  type AssetHandle,
} from "@/design/server/inline-assets"
import { mimeFor } from "../../../../_lib/project-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string; file: string[] }> }

const INLINE_TRUTHY = new Set(["1", "true", "yes", "on"])

// GET /api/design/projects/[id]/export/<relPath>?inline=1
//
// Daemon shape (apps/daemon/src/import-export-routes.ts +
// inline-assets.ts): serves the artifact HTML with every same-project top-level
// `<link rel=stylesheet>` / `<script src>` inlined, so the SPA's "Export as
// HTML" share menu hands the user a single mostly-self-contained file. The
// FileViewer preview itself stays URL-load; this endpoint is the explicit
// export path. `inline=1` is required (matches the daemon's guard). Non-HTML
// owners are returned raw with their extension mime. The cloud port reads the
// owner + sibling assets from S3 instead of a local PROJECTS_DIR.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, file } = await params

  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")

  const inlineRaw = (
    new URL(req.url).searchParams.get("inline") ?? ""
  )
    .trim()
    .toLowerCase()
  if (!INLINE_TRUTHY.has(inlineRaw)) {
    return apiError(400, "BAD_REQUEST", "query parameter 'inline=1' is required")
  }

  const relPath = (file ?? []).join("/")
  if (!relPath) return apiError(400, "BAD_REQUEST", "file path required")

  let ownerBuffer: Buffer
  try {
    ownerBuffer = await getDesignFile(gate.ctx, id, relPath)
  } catch {
    return apiError(404, "FILE_NOT_FOUND", "file not found")
  }

  const mime = mimeFor(relPath)

  // Non-HTML owners are served raw (nothing to inline).
  if (!/^text\/html\b/.test(mime)) {
    return new NextResponse(new Uint8Array(ownerBuffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Security-Policy": "sandbox allow-scripts",
        "Cache-Control": "no-store",
      },
    })
  }

  if (ownerBuffer.length > MAX_INLINE_OWNER_BYTES) {
    return apiError(413, "PAYLOAD_TOO_LARGE", "owner html too large to inline")
  }

  const html = ownerBuffer.toString("utf8")

  // Sibling-asset reader: fetch project-relative CSS/JS bytes from S3.
  const reader = async (rel: string): Promise<AssetHandle | null> => {
    try {
      const buf = await getDesignFile(gate.ctx, id, rel)
      return {
        size: buf.length,
        read: async () => buf.toString("utf8"),
      }
    } catch {
      return null
    }
  }

  try {
    const inlined = await inlineRelativeAssets(html, relPath, reader)
    return new NextResponse(inlined, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Match the daemon: this response is null-origin/sandboxed so
        // top-level navigation to it cannot escalate to app-origin script.
        "Content-Security-Policy": "sandbox allow-scripts",
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    if (err instanceof InlineAssetsLimitError) {
      return apiError(413, "PAYLOAD_TOO_LARGE", err.message)
    }
    return apiError(400, "BAD_REQUEST", String(err))
  }
}

// POST /api/design/projects/[id]/export/pdf (and any other programmatic export)
//
// Daemon shape: desktop PDF/artifact export requires an Electron renderer
// (`desktopPdfExporter`); the plain HTTP daemon returns 501 UPSTREAM_UNAVAILABLE
// when no desktop runtime is reachable. The cloud port has no Electron, so this
// route mirrors that 501 — which drives the SPA's `exportProjectAsPdf` to fall
// back to the client-side jspdf renderer (see web/runtime/exports.ts).
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return apiError(
    501,
    "UPSTREAM_UNAVAILABLE",
    "desktop PDF export is only available in the desktop runtime",
  )
}
