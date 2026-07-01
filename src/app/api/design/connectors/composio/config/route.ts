import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Mirrors the daemon's PublicComposioConfig (apps/daemon/src/connectors/
 *  composio-config.ts): `{ configured, apiKeyTail }`. */
interface PublicComposioConfig {
  configured: boolean
  apiKeyTail: string
}

const DISABLED_CONFIG: PublicComposioConfig = { configured: false, apiKeyTail: "" }

// GET /api/design/connectors/composio/config
//
// STUB. Composio integration is not wired in this environment, so we always
// report an unconfigured (disconnected) key. `fetchComposioConfigFromDaemon`
// maps `configured: false` to "connectors gated", which keeps the connectors UI
// in its disabled state.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json(DISABLED_CONFIG)
}

// PUT /api/design/connectors/composio/config
//
// STUB. Accepts the request but stores nothing (there is no Composio backend to
// authorize against), returning the same disabled shape. `syncComposioConfigToDaemon`
// only checks `response.ok`; a subsequent GET still reports `configured: false`,
// so connectors stay gated rather than appearing falsely enabled.
export async function PUT(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json(DISABLED_CONFIG)
}
