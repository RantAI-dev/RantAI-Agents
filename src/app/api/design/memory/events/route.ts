import { requireDesignContext } from "@/design/server/auth"
import { heartbeatSseResponse } from "../../_lib/sse-heartbeat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/design/memory/events
//   (SPA opens `new EventSource('/api/memory/events')` in MemoryToast/
//   MemorySection — bypasses the fetch interceptor, so the URL is namespaced to
//   /api/design in those components.)
//
// Daemon shape (apps/daemon/src/routes/memory.ts `/api/memory/events`): an SSE
// stream of memory-extraction events (`connected` → `change`/`extraction`/
// `verify`). The cloud port has no memory-extraction pipeline, so we open a
// valid, heartbeating stream (initial `connected`, `: keepalive` every ~25s) so
// the global MemoryToast EventSource connects and holds instead of
// 404-backoff-looping. No real memory events are emitted.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  return heartbeatSseResponse({
    signal: req.signal,
    open: { event: "connected", data: { at: Date.now() } },
  })
}
