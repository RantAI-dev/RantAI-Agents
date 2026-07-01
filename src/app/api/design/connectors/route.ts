import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import type { ConnectorListResponse } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/design/connectors
//
// STUB. Connectors run through Composio (external provider) plus the daemon's
// connector service; neither is ported. Returns the daemon's shape with an empty
// list (`{ connectors: [] }`). The SPA's `fetchConnectors` already tolerates an
// empty list and renders the "no connectors" empty state.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: ConnectorListResponse = { connectors: [] }
  return NextResponse.json(body)
}
