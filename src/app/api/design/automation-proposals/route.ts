import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/design/automation-proposals?status=pending-review
//
// Daemon shape (apps/daemon/src/routes/automation.ts): `{ proposals }`.
// Automation proposals are produced by the automation-ingestion pipeline
// (agent-runtime driven) and persisted to the daemon's runtime data dir — there
// is no ported Prisma model and nothing generates proposals in this
// environment, so the list is always empty. The Tasks tab treats an empty list
// as "no proposals to review" and renders normally.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ proposals: [] })
}

// POST /api/design/automation-proposals
//
// STUB. The daemon creates a proposal via the automation pipeline; there is no
// ported store, and the SPA never calls this path (proposals are created by
// ingestion, then reviewed). Returns the daemon's string-error envelope.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json(
    {
      error:
        "Creating automation proposals requires the automation pipeline, which is not available in this environment yet.",
    },
    { status: 501 },
  )
}
