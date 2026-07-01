import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import type { CloudflarePagesZonesResponse } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/design/deploy/cloudflare-pages/zones
//
// STUB. Listing Cloudflare zones requires a configured Cloudflare API token
// (external provider, no cloud analogue). The daemon shape is
// `{ zones, cloudflarePages? }`; the SPA's `fetchCloudflarePagesZones` throws on
// a non-2xx, so we return a valid *empty* zone list (200) rather than an error
// envelope, letting the custom-domain picker render its empty state cleanly.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: CloudflarePagesZonesResponse = { zones: [] }
  return NextResponse.json(body)
}
