import { requireDesignContext } from "@/design/server/auth"
import { streamDesignRun } from "@/design/server/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/runs/[id]/events
//
// Daemon shape (apps/daemon/src/server.ts `/api/runs/:id/events`): a
// text/event-stream of ChatSseEvent frames (`start` → `agent` text_delta … →
// `end`) that the SPA's run client (web/providers/daemon.ts::consumeDaemonRun)
// consumes. The whole model generation runs inside this handler — the run was
// created (and the user turn persisted) by the preceding POST /api/design/runs.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  const { id } = await params
  const stream = streamDesignRun(gate.ctx, id, req.signal)

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so SSE frames flush immediately.
      "X-Accel-Buffering": "no",
    },
  })
}
