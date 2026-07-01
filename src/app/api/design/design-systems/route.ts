import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/design-systems
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts):
// `{ designSystems: DesignSystemSummary[] }`. The design-system catalog isn't
// ported yet, so we return an empty list (the SPA parses `json.designSystems ??
// []`). Swap in a real catalog read here when that group lands.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ designSystems: [] })
}
