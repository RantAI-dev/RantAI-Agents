import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { listDesignMessages } from "@/design/server/conversations-store"

type RouteParams = { params: Promise<{ id: string; cid: string }> }

// GET /api/design/projects/[id]/conversations/[cid]/messages
//
// Daemon shape (apps/daemon/src/routes/project/conversations.ts):
// `{ messages: ChatMessage[] }`, in position order. 404 when the conversation
// isn't found / not owned. The daemon's brand-extraction backfill on an empty
// transcript has no cloud analogue and is intentionally omitted.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid } = await params
  const messages = await listDesignMessages(gate.ctx, id, cid)
  if (messages === null) {
    return apiError(404, "NOT_FOUND", "conversation not found")
  }
  return NextResponse.json({ messages })
}
