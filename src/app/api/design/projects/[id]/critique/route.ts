import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  prepareStreamCritique,
  runCritique,
  type RunCritiqueParams,
} from "@/design/server/critique"
import { listCritiqueRunsByProject } from "@/design/server/critique-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/critique
//
// Critique-run history for a project (newest-first), scoped by ownership.
// Mirrors the daemon's per-project `critique_runs` listing shape:
// `{ runs: CritiqueRunRow[] }`.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const runs = await listCritiqueRunsByProject(gate.ctx, id)
  if (runs === null) return apiError(404, "PROJECT_NOT_FOUND", "not found")
  return NextResponse.json({ runs })
}

// POST /api/design/projects/[id]/critique
//
// Trigger a Critique Theater run (Design Jury) over a project's latest (or a
// supplied) artifact. Upstream the daemon ran critique inline during a normal
// generation and fanned `critique.*` events onto /api/projects/:id/events; the
// port exposes an explicit trigger backed by our gateway.
//
//   Body: { conversationId?, artifact?, model? }
//   - Default: returns the JSON critique result (score + rounds + findings).
//   - With `Accept: text/event-stream` or `?stream=1`: streams `critique.*`
//     SSE frames in the exact `panelEventToSse` wire shape the SPA reducer
//     consumes.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  let body: Record<string, unknown> = {}
  try {
    const raw = await req.text()
    if (raw.trim().length > 0) body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const critiqueParams: RunCritiqueParams = {
    projectId: id,
    conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
    artifact: typeof body.artifact === "string" ? body.artifact : null,
    model: typeof body.model === "string" ? body.model : null,
  }

  const url = new URL(req.url)
  const wantsStream =
    url.searchParams.get("stream") === "1" ||
    (req.headers.get("accept") ?? "").includes("text/event-stream")

  if (wantsStream) {
    const prepared = await prepareStreamCritique(gate.ctx, critiqueParams)
    if ("ok" in prepared && prepared.ok === false) {
      return apiError(prepared.status, prepared.code, prepared.message)
    }
    if (!("stream" in prepared)) {
      return apiError(500, "INTERNAL", "failed to prepare critique stream")
    }
    return new Response(prepared.stream(req.signal), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  }

  const result = await runCritique(gate.ctx, critiqueParams, req.signal)
  if ("ok" in result && result.ok === false) {
    return apiError(result.status, result.code, result.message)
  }
  return NextResponse.json(result)
}
