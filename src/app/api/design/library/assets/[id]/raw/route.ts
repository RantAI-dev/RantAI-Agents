import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  getLibraryAssetBytes,
  getLibraryAssetRecord,
} from "@/design/server/library-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/library/assets/[id]/raw
//
// The bytes endpoint `libraryAssetRawUrl` points at (consumed as an `<img src>`
// / CSS `url(...)` / download href). Daemon shape
// (apps/daemon/src/routes/library.ts `/api/library/assets/:id/raw`): the raw
// object bytes with `Content-Type` from the asset mime. The cloud port streams
// the bytes back from S3 (the daemon piped them from a local file) — RustFS is
// internal-only on staging, so bytes must flow through this app route, never a
// presigned URL handed to the browser.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  const record = await getLibraryAssetRecord(gate.ctx, id)
  if (!record) return apiError(404, "NOT_FOUND", "asset not found")

  const bytes = await getLibraryAssetBytes(record)
  if (!bytes) return apiError(404, "NOT_FOUND", "asset bytes not available")

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": record.mime ?? "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  })
}
