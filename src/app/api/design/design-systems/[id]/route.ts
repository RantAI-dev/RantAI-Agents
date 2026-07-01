import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { designSystems } from "@/design/server/design-catalog.generated"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/design-systems/[id]
//
// Daemon shape (apps/daemon/src/routes/design-systems.ts): the detail is the
// summary + `body` (raw DESIGN.md) + optional `packageInfo`, returned both
// flattened AND under a `designSystem` key — `{ ...detail, designSystem: detail }`.
// The SPA's `parseDesignSystemDetail` accepts either form. Served from the
// committed `design-catalog.generated.ts` snapshot of the bundled open-design
// catalog. Revision/preview/showcase/file sub-routes are not ported.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const detail = designSystems.find((d) => d.id === id)
  if (!detail) return apiError(404, "NOT_FOUND", "design system not found")
  return NextResponse.json({ ...detail, designSystem: detail })
}
