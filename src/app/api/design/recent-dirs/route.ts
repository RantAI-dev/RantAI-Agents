import { NextResponse } from "next/server"
import type { RecentLinkedDirsResponse } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/recent-dirs  (SPA fetches /api/recent-dirs, rewritten).
//
// Daemon shape (apps/daemon/src/routes/media.ts): `{ dirs: string[] }` — recent
// *host* working directories for the "link a local folder" picker, pruned to
// paths that still exist on disk. There is no host filesystem in the cloud, so
// we return an empty list; the SPA (web/providers/registry.ts::
// fetchRecentLinkedDirs) reads `json.dirs` and renders no recent folders.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: RecentLinkedDirsResponse = { dirs: [] }
  return NextResponse.json(body)
}
