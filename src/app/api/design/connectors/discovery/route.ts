import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import type { ConnectorDiscoveryResponse } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/design/connectors/discovery?refresh=&hydrateTools=
//
// STUB. Discovery pulls the Composio connector catalog (external provider) — not
// ported. Daemon shape: `{ connectors, meta? }`. We return an empty catalog; the
// SPA (`fetchConnectorDiscovery`, MemorySection) reads `connectors ?? []` and
// shows the "add a Composio API key to load the catalog" empty state.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const url = new URL(req.url)
  const refreshRequested = url.searchParams.get("refresh") === "true"
  const body: ConnectorDiscoveryResponse = {
    connectors: [],
    meta: { provider: "composio", refreshRequested },
  }
  return NextResponse.json(body)
}
