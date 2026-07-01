import { NextResponse } from "next/server"
import type { LiveArtifactSummary } from "@open-design/contracts"
import { apiError, requireDesignContext } from "@/design/server/auth"

// GET /api/design/live-artifacts?projectId=…  (SPA fetches /api/live-artifacts).
//
// Daemon shape (apps/daemon/src/routes/live-artifact.ts): `{ artifacts:
// LiveArtifactSummary[] }`, requiring a `projectId` query param. Live artifacts
// (agent-authored, self-refreshing widget surfaces) are daemon-runtime-backed
// and NOT ported to the cloud host — the ported run gateway delivers results as
// inline `<artifact type="text/html">` HTML instead. We return an empty list so
// the SPA (web/providers/registry.ts::fetchLiveArtifacts reads
// `json.liveArtifacts ?? json.artifacts ?? []`) renders no live artifacts.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const projectId = new URL(req.url).searchParams.get("projectId")
  if (!projectId) {
    return apiError(400, "BAD_REQUEST", "projectId query parameter is required")
  }
  const artifacts: LiveArtifactSummary[] = []
  return NextResponse.json({ artifacts })
}
