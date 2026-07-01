import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { listLibraryTasks } from "@/design/server/library-store"

export const runtime = "nodejs"

// GET /api/design/library/tasks?assetId=<id>
//
// List an asset's enrichment tasks: `{ tasks: LibraryTask[] }`. The daemon
// records one task per ingest (returned as `taskId`); the AI enrichment layer
// is not ported, so tasks land `skipped`. Scoped via the asset relation.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const assetId = new URL(req.url).searchParams.get("assetId")
  if (!assetId) return apiError(400, "BAD_REQUEST", "assetId is required")
  const tasks = await listLibraryTasks(gate.ctx, assetId)
  return NextResponse.json({ tasks })
}
