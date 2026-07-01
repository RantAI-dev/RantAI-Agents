import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import type { ConnectorAuthConfigPrepareResponse } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/design/connectors/auth-configs/prepare
//
// STUB. Preparing Composio auth configs requires the connector service +
// Composio (external provider), not ported. Daemon shape:
// `{ results: Record<connectorId, ConnectorAuthConfigPrepareResult> }`. We return
// an empty results map — a valid, "nothing prepared" response. With discovery
// returning no connectors, the SPA never has ids to prepare, so this is not
// reached from the UI in practice.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: ConnectorAuthConfigPrepareResponse = { results: {} }
  return NextResponse.json(body)
}
