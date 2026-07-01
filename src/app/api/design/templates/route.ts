import { NextResponse } from "next/server"
import type { ProjectTemplate } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/templates  (SPA fetches /api/templates, rewritten → here).
//
// NOTE: distinct from /api/design/design-templates. This is the *project
// templates* store — user-saved projects reusable as starting points
// (daemon: apps/daemon/src/routes/project/index.ts `/api/templates` →
// `{ templates: ProjectTemplate[] }`, consumed by web/state/projects.ts::
// listTemplates as `json.templates ?? []`). No project-template store is ported
// in the cloud yet, so we return an empty list; the SPA renders the empty state
// and every save/import path degrades gracefully.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const templates: ProjectTemplate[] = []
  return NextResponse.json({ templates })
}
