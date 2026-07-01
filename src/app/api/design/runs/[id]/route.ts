import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignRunStatus } from "@/design/server/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/runs/[id]  (SPA fetches /api/runs/:id, rewritten → here).
//
// Daemon shape (apps/daemon/src/routes/runs.ts `/api/runs/:id`): the run's
// `ChatRunStatusResponse` status body, 404 when unknown. The SPA's run client
// (web/providers/daemon.ts::fetchChatRunStatus) polls this to reconcile a
// dropped/reconnected SSE stream — without it a run that SUCCEEDED reads as
// failed. streamDesignRun records a status snapshot per run (running →
// succeeded/failed/canceled), so any run that started streaming resolves here.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const status = getDesignRunStatus(gate.ctx, id)
  if (!status) return apiError(404, "NOT_FOUND", "run not found")
  return NextResponse.json(status)
}
