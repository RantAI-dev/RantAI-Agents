import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { listDesignMediaTasks } from "@/design/server/workspace-store"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/media/tasks?includeDone=1
//
// Daemon shape (apps/daemon/src/routes/media.ts): `{ tasks }` where each task is
// the list-item projection (taskId/status/progress/…). Non-terminal only unless
// `includeDone`. 404 when the project isn't found / not owned.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const url = new URL(req.url)
  const includeDone =
    url.searchParams.get("includeDone") === "1" ||
    url.searchParams.get("includeDone") === "true"
  const tasks = await listDesignMediaTasks(gate.ctx, id, { includeDone })
  if (tasks === null) return apiError(404, "NOT_FOUND", "project not found")
  return NextResponse.json({ tasks })
}
