import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import { listRoutineRuns } from "@/design/server/routines-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/routines/[id]/runs?limit=20
// Daemon shape (apps/daemon/src/routes/routine.ts): `{ runs: RoutineRun[] }`,
// or 404 `{ error: 'routine not found' }`. DB-backed (OdRoutineRun); the list is
// empty until a routine executor lands, since nothing writes runs in the port.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const url = new URL(req.url)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20))
  const runs = await listRoutineRuns(gate.ctx, id, limit)
  if (runs === null) {
    return NextResponse.json({ error: "routine not found" }, { status: 404 })
  }
  return NextResponse.json({ runs })
}
