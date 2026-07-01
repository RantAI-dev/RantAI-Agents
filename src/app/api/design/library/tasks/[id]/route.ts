import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getLibraryTask } from "@/design/server/library-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/library/tasks/[id]
//
// Fetch a single enrichment task's status: `{ task: LibraryTask }`. Resolves the
// `taskId` returned by ingest. Scoped via the asset relation; 404 when missing /
// not owned.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const task = await getLibraryTask(gate.ctx, id)
  if (!task) return apiError(404, "NOT_FOUND", "task not found")
  return NextResponse.json({ task })
}
