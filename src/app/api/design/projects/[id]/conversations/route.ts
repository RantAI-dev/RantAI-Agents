import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  createDesignConversation,
  listDesignConversations,
} from "@/design/server/conversations-store"
import type { ChatMessage, ChatSessionMode } from "@open-design/contracts"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/projects/[id]/conversations
//
// Daemon shape (apps/daemon/src/routes/project/conversations.ts):
// `{ conversations: Conversation[] }`, newest-activity first, each carrying the
// derived messageCount / latestRun / totalDurationMs. 404 when the project isn't
// owned by the caller.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const conversations = await listDesignConversations(gate.ctx, id)
  if (conversations === null) {
    return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  }
  return NextResponse.json({ conversations })
}

// POST /api/design/projects/[id]/conversations
//
// Daemon shape: `{ conversation }`. Body is a CreateConversationRequest —
// `{ title?, sessionMode?, seedFromConversationId?, forkAfterMessageId?,
// seedMessages? }`. Seeding copies another (same-project) conversation's
// messages, powering Side Chat / Fork.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const hasExplicitSessionMode = Object.prototype.hasOwnProperty.call(
    body,
    "sessionMode",
  )

  const conversation = await createDesignConversation(gate.ctx, id, {
    title: typeof body.title === "string" ? body.title : null,
    sessionMode: body.sessionMode as ChatSessionMode | undefined,
    hasExplicitSessionMode,
    seedFromConversationId:
      typeof body.seedFromConversationId === "string"
        ? body.seedFromConversationId
        : null,
    forkAfterMessageId:
      typeof body.forkAfterMessageId === "string"
        ? body.forkAfterMessageId
        : null,
    seedMessages: Array.isArray(body.seedMessages)
      ? (body.seedMessages as ChatMessage[])
      : null,
  })
  if (conversation === null) {
    return apiError(404, "PROJECT_NOT_FOUND", "project not found")
  }
  return NextResponse.json({ conversation })
}
