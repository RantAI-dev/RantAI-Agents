import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// POST /api/design/active
//
// Daemon (apps/daemon/src/routes/active-context.ts) keeps a soft, in-memory
// "what is the user looking at right now?" channel that the MCP surface reads.
// The SPA POSTs the active project/file on every route change (fire-and-forget;
// the response is ignored). The cloud port has no MCP consumer for this, so we
// accept the write statelessly and echo the daemon's PostActiveOutput shape.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // Empty / invalid body → treat as a clear.
  }

  if (body.active === false) {
    return NextResponse.json({ active: false })
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : ""
  if (!projectId) {
    return NextResponse.json({ active: false })
  }
  const fileName =
    typeof body.fileName === "string" && body.fileName.length > 0
      ? body.fileName
      : null
  return NextResponse.json({
    active: true,
    projectId,
    fileName,
    ts: Date.now(),
  })
}

// GET /api/design/active — no persisted context in the cloud port.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ active: false })
}
