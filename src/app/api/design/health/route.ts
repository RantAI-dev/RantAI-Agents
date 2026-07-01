import { NextResponse } from "next/server"

// GET /api/design/health
//
// Daemon shape (apps/daemon/src/server.ts): `{ ok: true, version }`. The SPA's
// `daemonIsLive()` only checks `resp.ok`; `version` is a stable stub here since
// the cloud port has no daemon version to report. Left unauthenticated to match
// the daemon's open health probe.
export async function GET() {
  return NextResponse.json({ ok: true, version: "cloud" })
}
