import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignSystemGenerationJob } from "@/design/server/design-system-generation"

type RouteParams = { params: Promise<{ jobId: string }> }

// GET /api/design/design-systems/generation-jobs/[jobId]
//
// Daemon shape (apps/daemon/src/routes/design-systems.ts): `{ job }` or 404.
// Returns the live job snapshot (status/progress/steps). On success the job's
// `designSystemId` points at the persisted user OdDesignSystem; the SPA fetches
// that detail. Jobs are scoped to the owning user.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { jobId } = await params
  const job = getDesignSystemGenerationJob(gate.ctx, jobId)
  if (!job) return apiError(404, "NOT_FOUND", "design system generation job not found")
  return NextResponse.json({ job })
}
