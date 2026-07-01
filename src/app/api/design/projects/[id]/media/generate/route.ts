import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { createDesignMediaTask } from "@/design/server/workspace-store"
import { parseRenderRequest, runMediaRender } from "@/design/server/media-render"

// The render spawns headless Chrome + ffmpeg (node child_process / fs), so the
// route must run on the Node runtime, never the Edge one. `maxDuration` is bumped
// so a bounded capture (≤15s @ ≤60fps) fits even under a serverless deployment;
// under the persistent `bun server.ts` dev/prod process the fire-and-forget
// render simply continues on the event loop after the 202 response.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/design/projects/[id]/media/generate
//
// Cloud port of the daemon's HyperFrames / media video render
// (apps/daemon/src/routes/media.ts → generateMedia → renderHyperFramesViaCli).
// Upstream shelled out to `npx hyperframes render`; the cloud port swaps that for
// headless-Chrome frame capture + ffmpeg (see src/design/server/media-render.ts).
//
// Body (mirrors the daemon's media/generate keys, plus direct HTML sources):
//   surface        'video' (only supported HTML→MP4 surface)
//   model          e.g. 'hyperframes-html' (default)
//   html           inline animated HTML string, OR
//   source|input|artifact   project-relative path to an .html artifact, OR
//   compositionDir project-relative dir whose index.html is rendered
//   duration       seconds (clamped 0.5–15)
//   fps            frames/sec (clamped 1–60)
//   width,height   explicit pixels, OR aspect ('16:9'|'9:16'|'1:1'|'4:3'|'3:4')
//   loop, output, gif
//
// Async, like the daemon: records a queued OdMediaTask, kicks the render
// (fire-and-forget — it drives the row queued→running→done/failed), and returns
// the daemon's task envelope. `GET .../media/tasks` polls status/progress/file.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // Body is optional; parseRenderRequest fills defaults.
  }

  const parsed = parseRenderRequest(body)
  if (!parsed.ok) return apiError(400, "BAD_REQUEST", parsed.message)

  const task = await createDesignMediaTask(gate.ctx, id, {
    surface: parsed.params.surface,
    model: parsed.params.model,
  })
  if (task === null) return apiError(404, "NOT_FOUND", "project not found")

  // Fire-and-forget: the render updates the OdMediaTask row; the caller polls
  // `GET .../media/tasks?includeDone=1`. Errors are recorded on the task, so the
  // rejection here is intentionally swallowed.
  void runMediaRender(gate.ctx, id, task.taskId, parsed.params).catch(() => {})

  return NextResponse.json(
    { taskId: task.taskId, status: "running", startedAt: task.startedAt, task },
    { status: 202 },
  )
}
