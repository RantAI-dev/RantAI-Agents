import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  DesignImportError,
  importShadcnDesignSystem,
  type ShadcnImportRequest,
} from "@/design/server/design-system-import"

// POST /api/design/design-systems/import/shadcn
//
// Real port of the daemon's shadcn design-system import
// (apps/daemon/src/design-systems/shadcn-import.ts). Accepts either the shadcn
// CLI shorthand `<owner>/<repo>/<item>[#ref]` (resolved against the repo's
// registry.json on raw.githubusercontent.com) or a direct https URL to a
// registry-item / registry-index JSON on a well-known shadcn host. Fetches the
// PUBLIC registry document over an SSRF host allowlist, maps its `cssVars`
// (theme/light/dark, HSL-triplet or oklch) → hex swatches + a DESIGN.md, and
// persists via the user design-system store (source='user', isEditable).
//
// Daemon response shape: `{ designSystem }`. We return 201 to match the create
// route convention.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  let input: ShadcnImportRequest
  try {
    input = ((await req.json()) as ShadcnImportRequest) || ({} as ShadcnImportRequest)
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid request body")
  }
  if (!input.reference || typeof input.reference !== "string") {
    return apiError(400, "BAD_REQUEST", "reference is required")
  }

  try {
    const designSystem = await importShadcnDesignSystem(gate.ctx, input)
    return NextResponse.json({ designSystem }, { status: 201 })
  } catch (err) {
    if (err instanceof DesignImportError) {
      return apiError(err.status, err.code, err.message)
    }
    return apiError(
      500,
      "INTERNAL_ERROR",
      `shadcn import failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
