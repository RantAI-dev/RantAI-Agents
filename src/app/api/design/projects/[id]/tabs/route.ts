import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { getDesignTabs, setDesignTabs } from "@/design/server/workspace-store"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/tabs
//
// Daemon shape (apps/daemon/src/routes/project/index.ts): the raw
// ProjectTabsState object (`{ tabs, active, browserTabs?, hasSavedState?,
// updatedAt? }`). 404 when the project isn't found / not owned.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const state = await getDesignTabs(gate.ctx, id)
  if (state === null) return apiError(404, "NOT_FOUND", "project not found")
  return NextResponse.json(state)
}

// PUT /api/design/projects/[id]/tabs
//
// Daemon shape: echoes the freshly-persisted ProjectTabsState. Validates
// `tabs: string[]` and `browserTabs: array` (400 otherwise), matching the
// daemon's guards.
export async function PUT(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const tabs = body.tabs ?? []
  const active = body.active ?? null
  const browserTabs = body.browserTabs ?? []
  if (!Array.isArray(tabs) || !tabs.every((t) => typeof t === "string")) {
    return apiError(400, "BAD_REQUEST", "tabs must be string[]")
  }
  if (!Array.isArray(browserTabs)) {
    return apiError(400, "BAD_REQUEST", "browserTabs must be an array")
  }

  const state = await setDesignTabs(gate.ctx, id, {
    tabs: tabs as string[],
    active: typeof active === "string" ? active : null,
    browserTabs: browserTabs as unknown[],
  })
  if (state === null) return apiError(404, "NOT_FOUND", "project not found")
  return NextResponse.json(state)
}
