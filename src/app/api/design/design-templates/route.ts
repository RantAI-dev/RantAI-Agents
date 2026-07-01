import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/design-templates
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts):
// `{ designTemplates: SkillSummary[] }`. The rendering catalog isn't ported yet,
// so we return an empty list (the SPA parses `json.designTemplates ?? []`).
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ designTemplates: [] })
}
