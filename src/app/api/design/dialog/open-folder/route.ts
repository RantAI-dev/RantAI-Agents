import { NextResponse } from "next/server"

// POST /api/design/dialog/open-folder
//
// Desktop-only in the daemon (apps/daemon/src/routes/media.ts): it opens a
// native OS folder picker and returns the chosen absolute path. No native shell
// exists in the cloud, so we return `{ path: null }`. The SPA's `openFolderDialog`
// treats a null/empty path as "no folder selected" and falls back to manual
// working-directory entry.
export function POST() {
  return NextResponse.json({ path: null })
}
