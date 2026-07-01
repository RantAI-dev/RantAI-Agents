import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  DesignImportError,
  importGitHubDesignSystem,
  type GitHubImportRequest,
} from "@/design/server/design-system-import"

// POST /api/design/design-systems/import/github
//
// Real port of the daemon's GitHub design-system import
// (apps/daemon/src/design-systems/github-import.ts). The daemon cloned the repo
// with `git clone --depth 1` and ran a local filesystem scan; the cloud port
// has no local FS + no git binary, so it instead does a SERVER-SIDE fetch of
// PUBLIC files (raw.githubusercontent.com + api.github.com, no token) over an
// SSRF host allowlist, extracts CSS custom properties / a Tailwind config /
// DESIGN.md / package.json, composes a DESIGN.md + swatches, and persists via
// the user design-system store (source='user', isEditable).
//
// Daemon response shape: `{ designSystem }`. We return 201 to match the create
// route convention.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  let input: GitHubImportRequest
  try {
    input = ((await req.json()) as GitHubImportRequest) || ({} as GitHubImportRequest)
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid request body")
  }
  if (!input.githubUrl || typeof input.githubUrl !== "string") {
    return apiError(400, "BAD_REQUEST", "githubUrl is required")
  }

  try {
    const designSystem = await importGitHubDesignSystem(gate.ctx, input)
    return NextResponse.json({ designSystem }, { status: 201 })
  } catch (err) {
    if (err instanceof DesignImportError) {
      return apiError(err.status, err.code, err.message)
    }
    return apiError(
      500,
      "INTERNAL_ERROR",
      `GitHub import failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
