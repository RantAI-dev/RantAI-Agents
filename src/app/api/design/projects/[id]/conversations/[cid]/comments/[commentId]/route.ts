import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  PreviewCommentInputError,
  deleteDesignPreviewComment,
  updateDesignPreviewCommentStatus,
} from "@/design/server/workspace-store"

type RouteParams = { params: Promise<{ id: string; cid: string; commentId: string }> }

// PATCH /api/design/projects/[id]/conversations/[cid]/comments/[commentId]
//
// Daemon shape (apps/daemon/src/routes/project/comments.ts): `{ comment }`.
// Body: `{ status }`. 400 on invalid status, 404 when the conversation or the
// comment isn't found / not owned.
export async function PATCH(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid, commentId } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  try {
    const comment = await updateDesignPreviewCommentStatus(
      gate.ctx,
      id,
      cid,
      commentId,
      body?.status,
    )
    if (comment === undefined) {
      return apiError(404, "NOT_FOUND", "conversation not found")
    }
    if (comment === null) {
      return apiError(404, "NOT_FOUND", "comment not found")
    }
    return NextResponse.json({ comment })
  } catch (err) {
    if (err instanceof PreviewCommentInputError) {
      return apiError(400, "BAD_REQUEST", err.message)
    }
    throw err
  }
}

// DELETE /api/design/projects/[id]/conversations/[cid]/comments/[commentId]
//
// Daemon shape: `{ ok: true }`. 404 when the conversation or the comment isn't
// found / not owned.
export async function DELETE(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid, commentId } = await params
  const removed = await deleteDesignPreviewComment(gate.ctx, id, cid, commentId)
  if (removed === undefined) {
    return apiError(404, "NOT_FOUND", "conversation not found")
  }
  if (!removed) return apiError(404, "NOT_FOUND", "comment not found")
  return NextResponse.json({ ok: true })
}
