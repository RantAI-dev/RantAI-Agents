import { NextResponse } from "next/server"

// POST /api/design/dir-exists
//
// Desktop-only in the daemon (apps/daemon/src/routes/media.ts): it stats a local
// working directory so the composer can red-flag a folder the moment it's deleted
// on disk. The cloud has no host filesystem, so we always report `{ exists: true }`
// — the SPA's `dirExists` reads `data.exists !== false`, so this keeps it from
// false-flagging directories it cannot probe.
export function POST() {
  return NextResponse.json({ exists: true })
}
