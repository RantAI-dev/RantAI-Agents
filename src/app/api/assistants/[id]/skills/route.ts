import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveActiveOrg } from "@/lib/org-context"
import {
  AssistantIdParamsSchema,
  AssistantSkillIdsSchema,
} from "@/features/assistants/bindings/schema"
import {
  isServiceError,
  listAssistantSkills,
  setAssistantSkills,
} from "@/features/assistants/bindings/service"

// GET /api/assistants/[id]/skills - Get assistant's enabled skills
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const orgContext = await resolveActiveOrg(req, session.user.id)
    const result = await listAssistantSkills(parsedParams.data.id, {
      organizationId: orgContext?.organizationId ?? null,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant Skills API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant skills" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/skills - Set assistant's enabled skills
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const parsedBody = AssistantSkillIdsSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "skillIds must be an array" },
        { status: 400 }
      )
    }

    const orgContext = await resolveActiveOrg(req, session.user.id)
    const result = await setAssistantSkills(
      parsedParams.data.id,
      parsedBody.data.skillIds,
      { organizationId: orgContext?.organizationId ?? null }
    )
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant Skills API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant skills" },
      { status: 500 }
    )
  }
}
