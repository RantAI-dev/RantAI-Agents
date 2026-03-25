import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  AssistantIdParamsSchema,
  UpdateAssistantSchema,
} from "@/src/features/assistants/core/schema"
import {
  deleteAssistantForUser,
  getAssistantForUser,
  updateAssistantForUser,
} from "@/src/features/assistants/core/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

function isHttpServiceError(value: unknown): value is { status: number; error: string } {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { status?: unknown; error?: unknown }
  return (
    typeof candidate.status === "number" &&
    typeof candidate.error === "string"
  )
}

// GET /api/assistants/[id] - Get single assistant
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(request, session.user.id)
    const assistant = await getAssistantForUser({
      id: parsedParams.data.id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
      },
    })
    if (isHttpServiceError(assistant)) {
      return NextResponse.json({ error: assistant.error }, { status: assistant.status })
    }

    return NextResponse.json(assistant)
  } catch (error) {
    console.error("Failed to fetch assistant:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id] - Update assistant
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(request, session.user.id)
    const bodyParse = UpdateAssistantSchema.safeParse(await request.json())
    if (!bodyParse.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: bodyParse.error.flatten() },
        { status: 400 }
      )
    }
    const assistant = await updateAssistantForUser({
      id: parsedParams.data.id,
      userId: session.user.id,
      input: bodyParse.data,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
      },
    })
    if (isHttpServiceError(assistant)) {
      return NextResponse.json({ error: assistant.error }, { status: assistant.status })
    }

    return NextResponse.json(assistant)
  } catch (error) {
    console.error("Failed to update assistant:", error)
    return NextResponse.json(
      { error: "Failed to update assistant" },
      { status: 500 }
    )
  }
}

// DELETE /api/assistants/[id] - Delete assistant
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }
    const orgContext = await getOrganizationContext(request, session.user.id)

    const result = await deleteAssistantForUser({
      id: parsedParams.data.id,
      context: {
        organizationId: orgContext?.organizationId ?? null,
        role: orgContext?.membership.role ?? null,
      },
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to delete assistant:", error)
    return NextResponse.json(
      { error: "Failed to delete assistant" },
      { status: 500 }
    )
  }
}
