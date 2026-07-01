import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  deleteDesignConversation,
  updateDesignConversation,
  type UpdateDesignConversationInput,
} from "@/design/server/conversations-store"
import type { ChatSessionMode } from "@open-design/contracts"

type RouteParams = { params: Promise<{ id: string; cid: string }> }

// PATCH /api/design/projects/[id]/conversations/[cid]
//
// Daemon shape (apps/daemon/src/routes/project/conversations.ts): `{ conversation }`.
// Accepts the UpdateConversationRequest subset the SPA sends (mostly `title`,
// occasionally `sessionMode`). 404 when the conversation isn't found / not owned.
export async function PATCH(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  const patch: UpdateDesignConversationInput = {}
  if ("title" in body) {
    patch.title = typeof body.title === "string" ? body.title : null
  }
  if ("sessionMode" in body) {
    patch.sessionMode = body.sessionMode as ChatSessionMode
  }
  if (typeof body.updatedAt === "number") {
    patch.updatedAt = body.updatedAt
  }

  const conversation = await updateDesignConversation(gate.ctx, id, cid, patch)
  if (conversation === null) {
    return apiError(404, "NOT_FOUND", "not found")
  }
  return NextResponse.json({ conversation })
}

// DELETE /api/design/projects/[id]/conversations/[cid]
//
// Daemon shape: `{ ok: true }`. 404 when the conversation isn't found / not owned.
export async function DELETE(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid } = await params
  const ok = await deleteDesignConversation(gate.ctx, id, cid)
  if (!ok) return apiError(404, "NOT_FOUND", "not found")
  return NextResponse.json({ ok: true })
}
