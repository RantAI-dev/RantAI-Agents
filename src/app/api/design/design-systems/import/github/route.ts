import { apiError, requireDesignContext } from "@/design/server/auth"

// POST /api/design/design-systems/import/github  [DEFERRED STUB]
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts): `201 { designSystem }`.
// Importing a design system from a GitHub repo depends on the daemon's
// clone/scan pipeline, which is not part of the cloud port yet. Returns a valid
// error envelope; the SPA's `importGitHubDesignSystem` maps a non-ok response
// to `null` and shows an import-failed state. Deferred.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return apiError(
    501,
    "NOT_IMPLEMENTED",
    "GitHub design-system import is not available in the cloud port yet",
  )
}
