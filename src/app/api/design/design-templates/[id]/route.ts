import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { designTemplates } from "@/design/server/design-catalog.generated"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/design-templates/[id]
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts): the detail is the
// SkillSummary + `body` (the SKILL.md markdown), returned flat (no wrapper).
// The SPA's `fetchDesignTemplate` reads the JSON directly as a `SkillDetail`.
// Served from the committed `design-catalog.generated.ts` snapshot of the
// bundled open-design catalog.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const detail = designTemplates.find((t) => t.id === id)
  if (!detail) return apiError(404, "NOT_FOUND", "design template not found")
  return NextResponse.json(detail)
}
