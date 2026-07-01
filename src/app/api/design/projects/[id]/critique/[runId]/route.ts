import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getCritiqueRun } from "@/design/server/critique-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string; runId: string }> }

// GET /api/design/projects/[id]/critique/[runId]
//
// Fetch a single persisted critique run (the OdCritiqueRun row), scoped to a
// project owned by the caller. Shape: `{ run: CritiqueRunRow }`.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, runId } = await params
  const run = await getCritiqueRun(gate.ctx, id, runId)
  if (!run) return apiError(404, "CRITIQUE_RUN_NOT_FOUND", "not found")
  return NextResponse.json({ run })
}
