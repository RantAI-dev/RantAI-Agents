import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string; action: string }> }

// POST /api/design/automation-proposals/[id]/apply
// POST /api/design/automation-proposals/[id]/reject
//
// Daemon shape (apps/daemon/src/routes/automation.ts): apply returns the apply
// result, reject returns `{ proposal }`; both 404 with the string-error
// envelope `{ error: 'automation proposal not found' }` when the id is unknown.
// No proposals exist in this environment (the ingestion pipeline is not ported),
// so every id is unknown and we return the daemon's 404. TasksView `reviewProposal`
// reads `j.error` and degrades gracefully — though with an always-empty proposal
// list, this path is never reached from the UI.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { action } = await params
  if (action !== "apply" && action !== "reject") {
    return NextResponse.json({ error: "unsupported proposal action" }, { status: 400 })
  }
  return NextResponse.json({ error: "automation proposal not found" }, { status: 404 })
}
