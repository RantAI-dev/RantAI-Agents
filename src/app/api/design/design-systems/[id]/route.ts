import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { designSystems } from "@/design/server/design-catalog.generated"
import {
  deleteUserDesignSystem,
  getUserDesignSystem,
  isUserDesignSystemId,
  updateUserDesignSystem,
  type UserDesignSystemInput,
} from "@/design/server/user-design-systems"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/design-systems/[id]
//
// Daemon shape (apps/daemon/src/routes/design-systems.ts): the detail is the
// summary + `body` (raw DESIGN.md) + optional `packageInfo`, returned both
// flattened AND under a `designSystem` key — `{ ...detail, designSystem: detail }`.
// User systems (id prefixed `user:`) resolve from the OdDesignSystem table
// (editable); everything else resolves from the read-only bundled catalog.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  if (isUserDesignSystemId(id)) {
    const detail = await getUserDesignSystem(gate.ctx, id)
    if (!detail) return apiError(404, "NOT_FOUND", "design system not found")
    return NextResponse.json({ ...detail, designSystem: detail })
  }
  const detail = designSystems.find((d) => d.id === id)
  if (!detail) return apiError(404, "NOT_FOUND", "design system not found")
  return NextResponse.json({ ...detail, designSystem: detail })
}

// PATCH /api/design/design-systems/[id]
//
// Daemon shape: `{ ...updated, designSystem }` or 404 for non-editable systems.
// Only user systems (source=user) can be edited; preset ids return 404, matching
// the daemon's "editable design system not found" guard.
export async function PATCH(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  let input: UserDesignSystemInput
  try {
    input = ((await req.json()) as UserDesignSystemInput) || {}
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid request body")
  }
  const updated = await updateUserDesignSystem(gate.ctx, id, input)
  if (!updated) return apiError(404, "NOT_FOUND", "editable design system not found")
  return NextResponse.json({ ...updated, designSystem: updated })
}

// PUT is an alias for PATCH (the SPA uses PATCH; keep PUT for parity).
export const PUT = PATCH

// DELETE /api/design/design-systems/[id]
//
// Daemon shape: `204` or 404 for non-editable systems.
export async function DELETE(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const ok = await deleteUserDesignSystem(gate.ctx, id)
  if (!ok) return apiError(404, "NOT_FOUND", "editable design system not found")
  return new NextResponse(null, { status: 204 })
}
