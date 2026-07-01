import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import type { DeployConfigResponse, DeployProviderId } from "@open-design/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const VERCEL_PROVIDER_ID: DeployProviderId = "vercel-self"
const DEPLOY_PROVIDER_IDS: DeployProviderId[] = ["vercel-self", "cloudflare-pages"]

function isDeployProviderId(value: string): value is DeployProviderId {
  return (DEPLOY_PROVIDER_IDS as string[]).includes(value)
}

/** An unconfigured, valid DeployConfigResponse for a provider — the daemon's
 *  `publicDeployConfigForProvider` output when no token is stored. */
function unconfiguredConfig(providerId: DeployProviderId): DeployConfigResponse {
  return {
    providerId,
    configured: false,
    tokenMask: "",
    teamId: "",
    teamSlug: "",
    target: "preview",
  }
}

// GET /api/design/deploy/config?providerId=vercel-self
//
// STUB. Deploy targets an external provider (Vercel / Cloudflare Pages) with a
// user-supplied token; there is no cloud analogue and no config store. We return
// a valid *unconfigured* config so the deploy modal renders its "connect a
// provider" state instead of erroring. Error envelope matches the daemon's
// `sendApiError` shape (`{ error: { code, message } }`).
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const url = new URL(req.url)
  const providerId = url.searchParams.get("providerId") || VERCEL_PROVIDER_ID
  if (!isDeployProviderId(providerId)) {
    return apiError(400, "BAD_REQUEST", "unsupported deploy provider")
  }
  return NextResponse.json(unconfiguredConfig(providerId))
}

// PUT /api/design/deploy/config
//
// STUB. Persisting a deploy provider token would enable deploys that this
// environment cannot perform. Returns NOT_IMPLEMENTED in the daemon's error
// envelope; the SPA's `updateDeployConfig` surfaces `error.message`.
export async function PUT(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return apiError(
    501,
    "NOT_IMPLEMENTED",
    "Deploy provider configuration is not available in this environment.",
  )
}
