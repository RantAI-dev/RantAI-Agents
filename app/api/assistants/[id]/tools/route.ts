import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  AssistantIdParamsSchema,
  AssistantToolIdsSchema,
} from "@/src/features/assistants/bindings/schema"
import {
  isServiceError,
  listAssistantTools,
  setAssistantTools,
} from "@/src/features/assistants/bindings/service"

// GET /api/assistants/[id]/tools - Get assistant's enabled tools
export async function GET(
  _req: Request,
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

    const result = await listAssistantTools(parsedParams.data.id)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant Tools API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant tools" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/tools - Set assistant's enabled tools
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

    const parsedBody = AssistantToolIdsSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "toolIds must be an array" },
        { status: 400 }
      )
    }

    const result = await setAssistantTools(
      parsedParams.data.id,
      parsedBody.data.toolIds
    )
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant Tools API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant tools" },
      { status: 500 }
    )
  }
}
