import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignProject } from "@/design/server/projects-store"
import { heartbeatSseResponse } from "../../../_lib/sse-heartbeat"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/events
//   (SPA opens `new EventSource(projectEventsUrl(id))` — bypasses the fetch
//   interceptor, so its builder is namespaced to /api/design in the client.)
//
// Daemon shape (apps/daemon/src/routes/project/index.ts `/api/projects/:id/
// events`): a chokidar-backed file-change SSE stream (`ready` → `file-changed`
// …). The cloud port has no host filesystem watcher; produced-file previews
// already refresh through the run `tool_result`/artifact path. We open a valid,
// heartbeating stream (initial `ready`, `: keepalive` every ~25s) so the SPA's
// EventSource connects and holds instead of 404-backoff-looping. No real
// file-change events are emitted.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const project = await getDesignProject(gate.ctx, id)
  if (!project) return apiError(404, "PROJECT_NOT_FOUND", "project not found")

  return heartbeatSseResponse({
    signal: req.signal,
    open: { event: "ready", data: { projectId: id } },
  })
}
