import { NextResponse } from "next/server"

import { AssistantIdParamsSchema } from "@/features/assistants/core/schema"
import type { CreateAssistantInput } from "@/features/assistants/core/schema"
import {
  createAssistantForUser,
  getAssistantForUser,
} from "@/features/assistants/core/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getMobileContext } from "@/lib/mobile-org"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/mobile/assistants/[id]/duplicate — clone an agent's core config
 * into a new org-scoped agent named "<name> (Copy)". Tool/skill/etc. bindings
 * are out of MVP scope and not copied.
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

    const source = await getAssistantForUser({
      id: parsedParams.data.id,
      context: { organizationId: ctx.organizationId, role: ctx.role },
    })
    if (isHttpServiceError(source)) {
      return NextResponse.json({ error: source.error }, { status: source.status })
    }

    const s = source as Record<string, unknown>
    const input: CreateAssistantInput = {
      name: `${String(s.name)} (Copy)`,
      description: (s.description as string | null) ?? undefined,
      emoji: (s.emoji as string | undefined) ?? undefined,
      systemPrompt: String(s.systemPrompt),
      model: (s.model as string | undefined) ?? undefined,
      useKnowledgeBase: (s.useKnowledgeBase as boolean | undefined) ?? undefined,
      knowledgeBaseGroupIds: (s.knowledgeBaseGroupIds as string[] | undefined) ?? undefined,
      liveChatEnabled: (s.liveChatEnabled as boolean | undefined) ?? undefined,
      modelConfig: (s.modelConfig as unknown) ?? undefined,
      openingMessage: (s.openingMessage as string | null) ?? undefined,
      openingQuestions: (s.openingQuestions as string[] | undefined) ?? undefined,
      chatConfig: (s.chatConfig as unknown) ?? undefined,
      guardRails: (s.guardRails as unknown) ?? undefined,
      memoryConfig: (s.memoryConfig as unknown) ?? undefined,
      avatarS3Key: (s.avatarS3Key as string | null) ?? undefined,
      tags: (s.tags as string[] | undefined) ?? undefined,
    }

    const created = await createAssistantForUser({
      userId: ctx.userId,
      input,
      organizationId: ctx.organizationId,
      role: ctx.role,
    })
    if (isHttpServiceError(created)) {
      return NextResponse.json({ error: created.error }, { status: created.status })
    }

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error("[Mobile Assistants API] duplicate error:", error)
    return NextResponse.json({ error: "Failed to duplicate assistant" }, { status: 500 })
  }
}
