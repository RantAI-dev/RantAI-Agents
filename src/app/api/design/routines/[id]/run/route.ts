import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import { routineExists } from "@/design/server/routines-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/design/routines/[id]/run
//
// STUB. The daemon (apps/daemon/src/routes/routine.ts) returns 202 with the
// freshly started run — but "run now" spawns an agent subprocess through the
// desktop agent-runtime + scheduler (routineService.runNow), which is not
// ported. We still honor the daemon's 404-first contract when the routine does
// not exist, then report the missing executor with the daemon's string-error
// envelope so the SPA surfaces a clean error toast (TasksView `runNow`).
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  if (!(await routineExists(gate.ctx, id))) {
    return NextResponse.json({ error: "routine not found" }, { status: 404 })
  }
  return NextResponse.json(
    {
      error:
        "Running a routine on demand requires the agent runtime, which is not available in this environment yet.",
    },
    { status: 501 },
  )
}
