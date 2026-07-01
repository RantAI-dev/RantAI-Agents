import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/plugins  (SPA fetches /api/plugins, rewritten → here).
//
// Daemon shape (apps/daemon/src/routes/plugins/index.ts): `{ plugins: [...] }`
// — the local plugin registry. The plugin ecosystem (install/apply/
// marketplaces/assets) is daemon-filesystem-backed and NOT ported to the cloud
// host, so we return an empty catalogue. The SPA reads `json.plugins`
// (state/projects.ts) and renders the empty "no plugins" state instead of
// 404-looping.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ plugins: [] })
}
