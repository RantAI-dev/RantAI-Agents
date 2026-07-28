import { NextResponse } from "next/server"

import { CreateAssistantSchema } from "@/features/assistants/core/schema"
import {
  createAssistantForUser,
  listAssistantsForUser,
} from "@/features/assistants/core/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getUserPreferences } from "@/features/user/preferences/service"
import { getMobileContext } from "@/lib/mobile-org"

/**
 * GET /api/mobile/assistants — list agents visible to the user's org, plus the
 * user's personal default agent id (so the app can mark it in the list).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [assistants, preferences] = await Promise.all([
      listAssistantsForUser({
        organizationId: ctx.organizationId,
        role: ctx.role,
      }),
      getUserPreferences(ctx.userId),
    ])

    return NextResponse.json({
      assistants,
      defaultAssistantId: preferences.defaultAssistantId,
    })
  } catch (error) {
    console.error("[Mobile Assistants API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistants" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/mobile/assistants — create an agent. Only `name` and `systemPrompt`
 * are required; the rest is defaulted server-side.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getMobileContext(request)
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsed = CreateAssistantSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const assistant = await createAssistantForUser({
      userId: ctx.userId,
      input: parsed.data,
      organizationId: ctx.organizationId,
      role: ctx.role,
    })
    if (isHttpServiceError(assistant)) {
      return NextResponse.json({ error: assistant.error }, { status: assistant.status })
    }

    return NextResponse.json(assistant, { status: 201 })
  } catch (error) {
    console.error("[Mobile Assistants API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create assistant" },
      { status: 500 }
    )
  }
}
