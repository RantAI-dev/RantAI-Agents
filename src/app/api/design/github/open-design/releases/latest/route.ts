import { NextResponse } from "next/server"
import type { OpenDesignGithubLatestReleaseResponse } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/github/open-design/releases/latest
//   (SPA fetches /api/github/open-design/releases/latest, rewritten → here).
//
// Daemon shape (apps/daemon/src/routes/open-design-public-metadata.ts): `{
// repo, tag_name, html_url, fetchedAt, stale }` — the latest packaged release,
// used by the desktop app's update-check affordance. There is no packaged
// auto-update in the cloud runtime, so we return a `stale` shaped payload; the
// SPA (web/providers/registry.ts::fetchLatestGithubReleaseInfo) treats it as
// informational and never 404-loops.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: OpenDesignGithubLatestReleaseResponse = {
    repo: "nexu-io/open-design",
    tag_name: "",
    html_url: "https://github.com/nexu-io/open-design/releases",
    fetchedAt: Date.now(),
    stale: true,
  }
  return NextResponse.json(body)
}
