import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import { listLibraryAssets } from "@/design/server/library-store"
import type {
  LibraryAssetFilter,
  LibraryAssetKind,
  LibrarySourceKind,
} from "@open-design/contracts"

export const runtime = "nodejs"

// GET /api/design/library/assets
//
// Daemon shape (apps/daemon/src/routes/library.ts `/api/library/assets`):
// `{ assets: LibraryAsset[] }`, ordered by archive date desc. Scoped to the
// caller's { userId, organizationId }.
//
// Query filters mirror the daemon: kind, tag, domain, date, q, source,
// projectId, designSystemId, limit. Free-text `q` is a keyword match over
// caption/ocr/title/tags/url (there is no embedding search — see the store
// header); it is the graceful search fallback.
//
// DEGRADE vs daemon: the daemon runs a throttled design-system/project
// reconcile before listing. The cloud port has no local filesystem to scan, so
// there is no reconcile pass here (see the `/sync` route).
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const str = (key: string): string | undefined => {
    const v = url.searchParams.get(key)
    return v && v.length ? v : undefined
  }

  const filter: LibraryAssetFilter = {}
  const kind = str("kind")
  if (kind) filter.kind = kind as LibraryAssetKind
  const tag = str("tag")
  if (tag) filter.tag = tag
  const domain = str("domain")
  if (domain) filter.domain = domain
  const date = str("date")
  if (date) filter.date = date
  const q = str("q")
  if (q) filter.q = q
  const source = str("source")
  if (source) filter.source = source as LibrarySourceKind
  const projectId = str("projectId")
  if (projectId) filter.projectId = projectId
  const designSystemId = str("designSystemId")
  if (designSystemId) filter.designSystemId = designSystemId
  const limit = str("limit")
  if (limit) filter.limit = Number(limit)

  const assets = await listLibraryAssets(gate.ctx, filter)
  return NextResponse.json({ assets })
}
