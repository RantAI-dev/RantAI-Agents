import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { upsertDesignMessage } from "@/design/server/conversations-store"
import type { ChatMessage } from "@open-design/contracts"

type RouteParams = { params: Promise<{ id: string; cid: string; mid: string }> }

// PUT /api/design/projects/[id]/conversations/[cid]/messages/[mid]
//
// Daemon shape (apps/daemon/src/routes/project/conversations.ts): `{ message }`.
// Plain message persistence (the SPA's `saveMessage`) — upsert by id with an
// auto-assigned position, bumping the parent conversation + project `updatedAt`.
// This is distinct from the run/generation streaming endpoint; it only persists
// the finalized message the client already holds. The daemon's telemetry report
// has no cloud analogue and is omitted.
export async function PUT(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid, mid } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  if (typeof body.id === "string" && body.id !== mid) {
    return apiError(400, "BAD_REQUEST", "id mismatch")
  }
  if (typeof body.role !== "string" || typeof body.content !== "string") {
    return apiError(400, "BAD_REQUEST", "role and content required")
  }

  const message = { ...(body as unknown as ChatMessage), id: mid }
  const saved = await upsertDesignMessage(gate.ctx, id, cid, message)
  if (saved === null) {
    return apiError(404, "NOT_FOUND", "conversation not found")
  }
  return NextResponse.json({ message: saved })
}
