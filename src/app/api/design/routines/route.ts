import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import {
  createRoutine,
  listRoutines,
  RoutineValidationError,
} from "@/design/server/routines-store"
import type { CreateRoutineRequest } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The routine routes use the daemon's string-error envelope (`{ error }`),
 *  mirroring apps/daemon/src/routes/routine.ts (not the `{ error: { code } }`
 *  shape). The SPA reads `j.error` off these directly. */
function stringError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

// GET /api/design/routines
// Daemon shape (apps/daemon/src/routes/routine.ts): `{ routines: Routine[] }`.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  try {
    const routines = await listRoutines(gate.ctx)
    return NextResponse.json({ routines })
  } catch (err) {
    return stringError(err instanceof Error ? err.message : String(err), 500)
  }
}

// POST /api/design/routines
// Daemon shape: 201 `{ routine: Routine }`. Persisted to OdRoutine (scoped).
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  let body: CreateRoutineRequest
  try {
    body = (await req.json()) as CreateRoutineRequest
  } catch {
    return stringError("invalid JSON body", 400)
  }
  try {
    const routine = await createRoutine(gate.ctx, body)
    return NextResponse.json({ routine }, { status: 201 })
  } catch (err) {
    if (err instanceof RoutineValidationError) return stringError(err.message, 400)
    return stringError(err instanceof Error ? err.message : String(err), 400)
  }
}
