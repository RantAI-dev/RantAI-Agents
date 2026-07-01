import { apiError, requireDesignContext } from "@/design/server/auth"

// POST /api/design/design-systems/import/local  [INTENTIONALLY 501]
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts): `201 { designSystem }`.
// Unlike the github + shadcn imports (real server-side fetches of PUBLIC
// content, now implemented), a LOCAL import reads an absolute directory off the
// daemon host's filesystem (`baseDir` → importLocalDesignSystemProject). A
// multi-tenant serverless port has no such user-controlled local FS, so there
// is nothing safe to read — this stays 501 by design. The SPA's
// `importLocalDesignSystem` maps a non-ok response to an import-failed state;
// users should import from GitHub or shadcn instead.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return apiError(
    501,
    "NOT_IMPLEMENTED",
    "local design-system import needs a local filesystem, which the cloud has no analogue for — import from GitHub or shadcn instead",
  )
}
