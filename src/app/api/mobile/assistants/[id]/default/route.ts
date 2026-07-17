import { NextResponse } from "next/server"

import { AssistantIdParamsSchema } from "@/features/assistants/core/schema"
import { getAssistantForUser } from "@/features/assistants/core/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { updateUserPreferences } from "@/features/user/preferences/service"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/mobile/assistants/[id]/default — set this agent as the current
 * user's personal default (UserPreference.defaultAssistantId). Unlike the web
 * org-wide system default, this is per-user so any member can set it.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    // Enforce org scoping: only agents the user can see may become the default.
    const assistant = await getAssistantForUser({
      id: parsedParams.data.id,
      context: { organizationId: ctx.organizationId, role: ctx.role },
    })
    if (isHttpServiceError(assistant)) {
      return NextResponse.json({ error: assistant.error }, { status: assistant.status })
    }

    const preferences = await updateUserPreferences(ctx.userId, {
      defaultAssistantId: parsedParams.data.id,
    })
    if (isHttpServiceError(preferences)) {
      return NextResponse.json({ error: preferences.error }, { status: preferences.status })
    }

    return NextResponse.json(preferences)
  } catch (error) {
    console.error("[Mobile Assistants API] set default error:", error)
    return NextResponse.json({ error: "Failed to set default agent" }, { status: 500 })
  }
}
