import { NextResponse } from "next/server"
import type { ProjectDeploymentsResponse } from "@open-design/contracts"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { listDesignDeployments } from "@/design/server/projects-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/deployments
//   (SPA fetches /api/projects/:id/deployments, rewritten → here.)
//
// Daemon shape (apps/daemon/src/routes/deploy.ts): `{ deployments:
// DeploymentInfo[] }` — the project's deploy history (server.ts
// `publicDeployments` = normalized rows minus provider secrets). DB-backed:
// reads the ported `OdDeployment` model scoped to the caller's project. The
// actual deploy ACTION (POST /deploy) needs a Cloudflare/Vercel account and
// keeps its existing graceful stub; this read just lists what exists (empty
// until a deploy lands).
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const deployments = await listDesignDeployments(gate.ctx, id)
  if (deployments === null) {
    return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  }
  const body: ProjectDeploymentsResponse = { deployments }
  return NextResponse.json(body)
}
