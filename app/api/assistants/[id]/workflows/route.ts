import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  AssistantIdParamsSchema,
  AssistantWorkflowIdsSchema,
} from "@/src/features/assistants/bindings/schema"
import {
  isServiceError,
  listAssistantWorkflows,
  setAssistantWorkflows,
} from "@/src/features/assistants/bindings/service"

// GET /api/assistants/[id]/workflows - Get assistant's attached workflows
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

    const result = await listAssistantWorkflows(parsedParams.data.id)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant Workflows API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant workflows" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/workflows - Set assistant's attached workflows
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

    const parsedBody = AssistantWorkflowIdsSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "workflowIds must be an array" },
        { status: 400 }
      )
    }

    const result = await setAssistantWorkflows(
      parsedParams.data.id,
      parsedBody.data.workflowIds
    )
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant Workflows API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant workflows" },
      { status: 500 }
    )
  }
}
