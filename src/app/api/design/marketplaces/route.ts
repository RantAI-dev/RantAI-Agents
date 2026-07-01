import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/marketplaces  (SPA fetches /api/marketplaces, rewritten).
//
// Daemon shape (apps/daemon/src/routes/plugins/marketplaces.ts): `{
// marketplaces: [...] }` — plugin marketplace registries. Part of the unported
// plugin ecosystem, so we return an empty list; the SPA (state/projects.ts /
// components/MarketplaceView.tsx) reads `json.marketplaces` and renders the
// empty state instead of 404-looping.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ marketplaces: [] })
}
