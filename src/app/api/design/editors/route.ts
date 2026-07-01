import { NextResponse } from "next/server"
import type { HostEditorsResponse } from "@open-design/contracts"

// GET /api/design/editors
//
// Desktop-only in the daemon (apps/daemon/src/routes/host-tools.ts): it probes
// $PATH for locally-installed editors (Cursor, Zed, VS Code, Finder, …) so the
// user can open a project's folder in a native app. There is no host filesystem
// in the cloud, so we return an empty catalogue with `platform: 'unknown'`. The
// SPA's hand-off UI degrades to hiding the "open in editor" affordances.
export function GET() {
  const body: HostEditorsResponse = { editors: [], platform: "unknown" }
  return NextResponse.json(body)
}
