import { NextResponse } from "next/server"
import type { BrandSummary } from "@open-design/contracts"
import { apiError, requireDesignContext } from "@/design/server/auth"

// GET /api/design/brands
//
// In the daemon (apps/daemon/src/brand-routes.ts) a "brand" is an agent-driven
// extraction (browser tab + prompt) that finalizes into a `user:<id>` design
// system, backed by on-disk brand.json/meta.json. That extraction engine is
// desktop/agent-only and not ported, so we return an empty list. The SPA's
// `fetchBrands` / `useBrandsByDesignSystemId` degrade to their thin
// design-system previews (no rich Brand Kit card), which is the intended
// fallback when no finalized brands exist.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const brands: BrandSummary[] = []
  return NextResponse.json({ brands })
}

// POST /api/design/brands
//
// Reserving + running a brand extraction needs the desktop agent engine, which
// the cloud build does not host. Respond with the daemon's error envelope so the
// SPA's create flow surfaces a clean "not available" message instead of hanging.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return apiError(
    501,
    "NOT_IMPLEMENTED",
    "Brand extraction is not available in the cloud build.",
  )
}
