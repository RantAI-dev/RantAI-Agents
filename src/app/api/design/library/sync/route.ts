import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import type { LibrarySyncResponse } from "@open-design/contracts"

export const runtime = "nodejs"

// POST /api/design/library/sync
//
// Daemon shape (apps/daemon/src/routes/library.ts `/api/library/sync`): counts
// of design-system + project deliverables newly reconciled into the Library.
//
// STUB (empty reconcile): the daemon reconcile scans a local `LIBRARY_DIR` /
// `PROJECTS_DIR` / design-systems dir on disk to backfill referenced rows. The
// cloud port stores project files in S3 and has no such local scan, so there is
// nothing to reconcile — the Library is populated purely by explicit ingest.
// We return the empty reconcile shape so the toolbar "Sync" button succeeds
// (a no-op) instead of failing.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const body: LibrarySyncResponse = {
    designSystems: 0,
    projectAssets: 0,
    deduped: 0,
    total: 0,
  }
  return NextResponse.json(body)
}
