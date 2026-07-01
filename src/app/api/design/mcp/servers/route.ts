import { NextResponse } from "next/server"
import type { McpServersResponse } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET/PUT /api/design/mcp/servers  (SPA fetches /api/mcp/servers, rewritten).
//
// Daemon shape (apps/daemon/src/mcp-routes.ts): `{ servers: McpServerConfig[],
// templates: McpTemplate[] }`. External MCP server config is daemon-owned
// (persisted under the daemon data dir, injected into each agent spawn's
// `.mcp.json`). That wiring is NOT ported to the cloud host, so GET returns an
// empty catalogue and PUT echoes back the posted servers WITHOUT persisting —
// enough for the SPA (state/mcp.ts) to render its empty picker and avoid a
// 404-loop. The empty `templates` list simply hides the "add from template"
// shortcuts.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: McpServersResponse = { servers: [], templates: [] }
  return NextResponse.json(body)
}

export async function PUT(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  // Not persisted (MCP config is unported); echo an empty catalogue so the
  // SPA's save flow resolves cleanly instead of 404-ing.
  const body: McpServersResponse = { servers: [], templates: [] }
  return NextResponse.json(body)
}
