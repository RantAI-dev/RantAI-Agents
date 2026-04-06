import { NextResponse } from "next/server"
import { AssistantIdParamsSchema } from "@/features/assistants/default/schema"
import {
  removeSystemDefaultAssistant,
  setSystemDefaultAssistant,
} from "@/features/assistants/default/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/assistants/[id]/default - Set as system default
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }
    const { id } = parsedParams.data

    const updated = await setSystemDefaultAssistant(id)
    if (isHttpServiceError(updated)) {
      return NextResponse.json({ error: updated.error }, { status: updated.status })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to set system default:", error)
    return NextResponse.json(
      { error: "Failed to set system default" },
      { status: 500 }
    )
  }
}

// DELETE /api/assistants/[id]/default - Remove system default (makes no assistant the default)
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }
    const { id } = parsedParams.data

    const updated = await removeSystemDefaultAssistant(id)
    if (isHttpServiceError(updated)) {
      return NextResponse.json({ error: updated.error }, { status: updated.status })
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to remove system default:", error)
    return NextResponse.json(
      { error: "Failed to remove system default" },
      { status: 500 }
    )
  }
}
