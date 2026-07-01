import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { createDesignMediaTask } from "@/design/server/workspace-store"

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/design/projects/[id]/media/generate
//
// The daemon (apps/daemon/src/routes/media.ts) streams an actual generation run
// here — heavy, desktop/CLI-only (image/video/audio model calls). The cloud port
// does NOT run generation: it records a `queued` OdMediaTask (so the media-task
// list stays consistent) and returns a valid, non-streaming envelope flagged
// `NOT_IMPLEMENTED`. 404 when the project isn't found / not owned.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // Body is optional here — generation is stubbed regardless of its contents.
  }

  const surface = typeof body.surface === "string" ? body.surface : null
  const model = typeof body.model === "string" ? body.model : null

  const task = await createDesignMediaTask(gate.ctx, id, { surface, model })
  if (task === null) return apiError(404, "NOT_FOUND", "project not found")

  return NextResponse.json(
    {
      task,
      queued: true,
      error: {
        code: "NOT_IMPLEMENTED",
        message:
          "Media generation is not available in the cloud build; the task was recorded as queued.",
      },
    },
    { status: 501 },
  )
}
