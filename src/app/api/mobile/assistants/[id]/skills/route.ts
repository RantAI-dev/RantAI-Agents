import { NextResponse } from "next/server"

import {
  AssistantIdParamsSchema,
  AssistantSkillIdsSchema,
} from "@/features/assistants/bindings/schema"
import {
  isServiceError,
  listAssistantSkills,
  setAssistantSkills,
} from "@/features/assistants/bindings/service"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/mobile/assistants/[id]/skills — the skills currently bound to the
 * agent (mobile Bearer auth; catalog comes from GET /api/mobile/skills).
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

    const result = await listAssistantSkills(parsedParams.data.id, {
      organizationId: ctx.organizationId,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Assistant Skills API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant skills" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/mobile/assistants/[id]/skills — replace the agent's skill bindings.
 * Body: { skillIds: string[] }.
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

    const parsedBody = AssistantSkillIdsSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "skillIds must be an array of strings" },
        { status: 400 }
      )
    }

    const result = await setAssistantSkills(
      parsedParams.data.id,
      parsedBody.data.skillIds,
      { organizationId: ctx.organizationId }
    )
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Assistant Skills API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant skills" },
      { status: 500 }
    )
  }
}
