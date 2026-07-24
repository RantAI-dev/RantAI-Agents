import { NextResponse } from "next/server"

import {
  AssistantIdParamsSchema,
  AssistantToolIdsSchema,
} from "@/features/assistants/bindings/schema"
import {
  isServiceError,
  listAssistantTools,
  setAssistantTools,
} from "@/features/assistants/bindings/service"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/mobile/assistants/[id]/tools — the tools currently bound to the
 * agent (mobile Bearer auth; mirrors the web session-based route).
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const result = await listAssistantTools(parsedParams.data.id, {
      organizationId: ctx.organizationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Assistant Tools API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant tools" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/mobile/assistants/[id]/tools — replace the agent's tool bindings.
 * Body: { toolIds: string[] }.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const parsedBody = AssistantToolIdsSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "toolIds must be an array of strings" },
        { status: 400 }
      )
    }

    const result = await setAssistantTools(
      parsedParams.data.id,
      parsedBody.data.toolIds,
      { organizationId: ctx.organizationId }
    )
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Assistant Tools API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant tools" },
      { status: 500 }
    )
  }
}
