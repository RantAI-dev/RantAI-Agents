import { NextResponse } from "next/server"
import type { OpenDesignGithubRepoResponse } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/github/open-design  (SPA fetches /api/github/open-design).
//
// Daemon shape (apps/daemon/src/routes/open-design-public-metadata.ts): `{
// repo, stargazers_count, fetchedAt, stale }` — GitHub star count for the
// topbar star pill, cached daemon-side to dodge GitHub's unauthenticated quota.
// We do not proxy GitHub from the cloud host; a `stale` shaped payload keeps the
// pill from 404-looping. The SPA (components/useGithubStars.ts) reads
// `stargazers_count` and falls back to its own label when absent, so a modest
// static count is a benign placeholder.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: OpenDesignGithubRepoResponse = {
    repo: "nexu-io/open-design",
    stargazers_count: 40000,
    fetchedAt: Date.now(),
    stale: true,
  }
  return NextResponse.json(body)
}
