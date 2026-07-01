import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import type { ConnectorStatusResponse } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/design/connectors/status
//
// STUB. Daemon shape: `{ statuses: Record<connectorId, ConnectorStatusSummary> }`.
// No connectors are configured (Composio + connector service not ported), so we
// return an empty status map. `fetchConnectorStatuses` treats this as "nothing
// connected".
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: ConnectorStatusResponse = { statuses: {} }
  return NextResponse.json(body)
}
