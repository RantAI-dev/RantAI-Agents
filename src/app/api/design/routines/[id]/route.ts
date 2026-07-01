import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import {
  deleteRoutine,
  getRoutine,
  updateRoutine,
  RoutineValidationError,
} from "@/design/server/routines-store"
import type { UpdateRoutineRequest } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

function stringError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

// GET /api/design/routines/[id]
// Daemon shape: `{ routine }` or 404 `{ error: 'routine not found' }`.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const routine = await getRoutine(gate.ctx, id)
  if (!routine) return stringError("routine not found", 404)
  return NextResponse.json({ routine })
}

// PATCH /api/design/routines/[id]
// Daemon shape: `{ routine }`; 404 when missing, 400 on invalid input.
export async function PATCH(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  let body: UpdateRoutineRequest
  try {
    body = (await req.json()) as UpdateRoutineRequest
  } catch {
    return stringError("invalid JSON body", 400)
  }
  try {
    const routine = await updateRoutine(gate.ctx, id, body)
    if (!routine) return stringError("routine not found", 404)
    return NextResponse.json({ routine })
  } catch (err) {
    if (err instanceof RoutineValidationError) return stringError(err.message, 400)
    return stringError(err instanceof Error ? err.message : String(err), 400)
  }
}

// DELETE /api/design/routines/[id]
// Daemon shape: 204 No Content; 404 when missing.
export async function DELETE(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const removed = await deleteRoutine(gate.ctx, id)
  if (!removed) return stringError("routine not found", 404)
  return new NextResponse(null, { status: 204 })
}
