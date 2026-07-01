import { apiError, requireDesignContext } from "@/design/server/auth"

type RouteParams = { params: Promise<{ jobId: string }> }

// GET /api/design/design-systems/generation-jobs/[jobId]  [DEFERRED STUB]
//
// Daemon shape (apps/daemon/src/routes/design-systems.ts): `{ job }` or 404.
// Generation jobs are never created in the cloud port (see the POST sibling),
// so any job id is unknown. Returns the daemon's 404 error envelope; the SPA's
// `fetchDesignSystemGenerationJob` maps a non-ok response to `null`. Deferred.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  await params
  return apiError(
    404,
    "NOT_FOUND",
    "design system generation job not found",
  )
}
