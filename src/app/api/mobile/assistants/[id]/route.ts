import { NextResponse } from "next/server"

import {
  AssistantIdParamsSchema,
  UpdateAssistantSchema,
} from "@/features/assistants/core/schema"
import {
  deleteAssistantForUser,
  getAssistantForUser,
  updateAssistantForUser,
} from "@/features/assistants/core/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/mobile/assistants/[id]
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

    const assistant = await getAssistantForUser({
      id: parsedParams.data.id,
      context: { organizationId: ctx.organizationId, role: ctx.role },
    })
    if (isHttpServiceError(assistant)) {
      return NextResponse.json({ error: assistant.error }, { status: assistant.status })
    }

    return NextResponse.json(assistant)
  } catch (error) {
    console.error("[Mobile Assistants API] GET [id] error:", error)
    return NextResponse.json({ error: "Failed to fetch assistant" }, { status: 500 })
  }
}

// PUT /api/mobile/assistants/[id]
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

    const bodyParse = UpdateAssistantSchema.safeParse(await request.json())
    if (!bodyParse.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: bodyParse.error.flatten() },
        { status: 400 }
      )
    }

    const assistant = await updateAssistantForUser({
      id: parsedParams.data.id,
      userId: ctx.userId,
      input: bodyParse.data,
      context: { organizationId: ctx.organizationId, role: ctx.role },
    })
    if (isHttpServiceError(assistant)) {
      return NextResponse.json({ error: assistant.error }, { status: assistant.status })
    }

    return NextResponse.json(assistant)
  } catch (error) {
    console.error("[Mobile Assistants API] PUT [id] error:", error)
    return NextResponse.json({ error: "Failed to update assistant" }, { status: 500 })
  }
}

// DELETE /api/mobile/assistants/[id]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const result = await deleteAssistantForUser({
      id: parsedParams.data.id,
      context: { organizationId: ctx.organizationId, role: ctx.role },
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Mobile Assistants API] DELETE [id] error:", error)
    return NextResponse.json({ error: "Failed to delete assistant" }, { status: 500 })
  }
}
