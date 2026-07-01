import { apiError, requireDesignContext } from "@/design/server/auth"

// POST /api/design/design-systems/generation-jobs  [DEFERRED STUB]
//
// Daemon shape (apps/daemon/src/routes/design-systems.ts): `202 { job }`.
// Agent-driven design-system generation requires the local daemon's agent
// runtime, which is not part of the cloud port yet. We return a valid error
// envelope (`{ error: { code, message } }`); the SPA's
// `startDesignSystemGenerationJob` treats a non-ok response as `null` and
// surfaces a graceful failure instead of polling a nonexistent job. Deferred.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return apiError(
    501,
    "NOT_IMPLEMENTED",
    "design-system generation is not available in the cloud port yet",
  )
}
