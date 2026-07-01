import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import { routineExists } from "@/design/server/routines-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string; runId: string }> }

// POST /api/design/routines/[id]/runs/[runId]/crystallize
//
// STUB. The daemon (apps/daemon/src/routes/routine.ts) turns a succeeded run
// into a reusable skill via `ingestAutomationSource`, which drives the
// automation pipeline through the agent runtime — not ported. There are also no
// routine runs to crystallize until an executor lands. We honor the daemon's
// 404-first contract (routine, then run) and otherwise report the missing
// pipeline with the daemon's string-error envelope. TasksView `crystallizeRun`
// reads `j.error` and shows a graceful failure.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  if (!(await routineExists(gate.ctx, id))) {
    return NextResponse.json({ error: "routine not found" }, { status: 404 })
  }
  // No runs exist in the port, so any runId is unknown for this routine.
  return NextResponse.json({ error: "routine run not found" }, { status: 404 })
}
