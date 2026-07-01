import { requireDesignContext } from "@/design/server/auth"
import { heartbeatSseResponse } from "../../_lib/sse-heartbeat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/design/library/events
//
// The SPA (LibrarySection) opens `new EventSource('/api/library/events')` for
// live ingest/enrichment updates and exponential-backoff reconnects on error.
// Daemon shape: an SSE feed (`ready` then `ingest`/`delete` events).
//
// DEGRADE vs daemon: the cloud port has no cross-request event bus, so we open a
// valid, heartbeating stream (initial `ready`, `: keepalive` every ~25s) so the
// EventSource connects and holds instead of 404-backoff-looping. No live
// domain events are pushed — the grid's manual Refresh (re-list) is the source
// of truth after an upload/delete.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  return heartbeatSseResponse({
    signal: req.signal,
    open: { event: "ready", data: { ok: true } },
  })
}
