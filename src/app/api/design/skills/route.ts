import { NextResponse } from "next/server"
import type { SkillSummary } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/skills  (SPA fetches /api/skills, rewritten → here).
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts `/api/skills`):
// `{ skills: SkillSummary[] }` — the functional-skills catalogue (utilities /
// briefs the agent invokes mid-task), distinct from the design-templates
// rendering catalogue served by /api/design/design-templates. The cloud port
// bundles design systems + design templates (design-catalog.generated.ts) but
// no functional-skills catalogue, so we return an empty list. The SPA reads
// `json.skills ?? []` (web/providers/registry.ts::fetchSkills) and renders the
// empty state; the design-templates gallery is unaffected.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const skills: SkillSummary[] = []
  return NextResponse.json({ skills })
}
