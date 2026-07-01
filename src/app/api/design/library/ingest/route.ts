import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  parseDataUrl,
  registerLibraryAsset,
  toPublicLibraryAsset,
} from "@/design/server/library-store"
import {
  LIBRARY_UPLOAD_MAX_BYTES,
  isLibraryUploadMimeAllowed,
  type LibraryAssetKind,
} from "@open-design/contracts"

export const runtime = "nodejs"

// POST /api/design/library/ingest
//
// Save/upload an asset into the Library. Daemon shape
// (apps/daemon/src/routes/library.ts `/api/library/ingest`):
// `{ asset, taskId?, deduped }`. The web UI drives this via `uploadLibraryFile`
// (inline `dataUrl`) and `uploadLibraryText` (`text`).
//
// Scoped to the caller's { userId, organizationId } and treated as a
// `manual-upload` source (the daemon's clipper/extension origins have no cloud
// analogue). Bytes are content-addressed into S3; metadata into OdLibraryAsset.
//
// DEGRADE vs daemon: remote `url` ingest (daemon `fetchRemoteBytes`) is not
// supported here — server-side fetch of an arbitrary client-supplied URL is an
// SSRF risk in a multi-tenant deployment. Callers must send `dataUrl` or `text`
// (the paths the web upload UI already uses).
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  let bytes: Buffer | undefined
  let mime: string | undefined = typeof body.mime === "string" ? body.mime : undefined
  const text = typeof body.text === "string" ? body.text : undefined
  const filename = typeof body.filename === "string" ? body.filename : undefined

  if (typeof body.dataUrl === "string") {
    const parsed = parseDataUrl(body.dataUrl)
    if (!parsed) return apiError(400, "BAD_REQUEST", "invalid dataUrl")
    bytes = parsed.bytes
    mime = mime ?? parsed.mime
  } else if (typeof body.url === "string") {
    return apiError(
      400,
      "UNSUPPORTED",
      "remote url ingest is not supported; send dataUrl or text",
    )
  } else if (text === undefined) {
    return apiError(400, "BAD_REQUEST", "one of dataUrl or text is required")
  }

  // Manual-upload format/size policy (shared with the web pre-flight). Text-only
  // payloads skip it — they are always a text-family asset.
  if (bytes) {
    if (bytes.length > LIBRARY_UPLOAD_MAX_BYTES) {
      return apiError(
        413,
        "PAYLOAD_TOO_LARGE",
        `file is too large to upload (max ${Math.round(LIBRARY_UPLOAD_MAX_BYTES / 1_000_000)} MB)`,
      )
    }
    if (!isLibraryUploadMimeAllowed(mime, filename)) {
      return apiError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "this file type cannot be uploaded to the Library — images, fonts, text, HTML, and JSON/design data only",
      )
    }
  }

  const reqMetadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined

  try {
    const result = await registerLibraryAsset(gate.ctx, {
      kind: typeof body.kind === "string" ? (body.kind as LibraryAssetKind) : undefined,
      bytes,
      text,
      mime,
      filename,
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
      sourceTitle: typeof body.sourceTitle === "string" ? body.sourceTitle : undefined,
      tags: Array.isArray(body.tags)
        ? body.tags.filter((t: unknown): t is string => typeof t === "string")
        : undefined,
      metadata: reqMetadata,
      source: { sourceKind: "manual-upload" },
    })
    return NextResponse.json({
      asset: toPublicLibraryAsset(result.asset),
      taskId: result.taskId,
      deduped: result.deduped,
    })
  } catch (err) {
    return apiError(500, "INGEST_FAILED", err instanceof Error ? err.message : String(err))
  }
}
