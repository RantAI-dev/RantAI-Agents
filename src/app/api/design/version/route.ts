import { NextResponse } from "next/server"
import type { AppVersionInfo } from "@open-design/contracts"

// GET /api/design/version  (SPA fetches /api/version, rewritten → here).
//
// Daemon shape (apps/daemon/src/server.ts `/api/version`): `{ version:
// AppVersionInfo }`. The SPA validates every AppVersionInfo field before use
// (web/providers/registry.ts::isAppVersionInfo requires version/channel/
// packaged/platform/arch) and only reads `version.version` for analytics
// (analytics/provider.tsx). We report a stable cloud descriptor — there is no
// packaged desktop build to version. Left unauthenticated to mirror the daemon's
// open probe and the sibling /api/design/health route.
export function GET() {
  const version: AppVersionInfo = {
    version: "cloud",
    channel: "cloud",
    packaged: false,
    platform: "web",
    arch: "cloud",
  }
  return NextResponse.json({ version })
}
