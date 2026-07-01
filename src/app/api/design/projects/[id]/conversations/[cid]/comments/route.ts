import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import {
  PreviewCommentInputError,
  listDesignPreviewComments,
  upsertDesignPreviewComment,
} from "@/design/server/workspace-store"

type RouteParams = { params: Promise<{ id: string; cid: string }> }

// GET /api/design/projects/[id]/conversations/[cid]/comments
//
// Daemon shape (apps/daemon/src/routes/project/comments.ts): `{ comments }`.
// 404 when the conversation isn't found / not owned (the SPA's
// `fetchPreviewComments` degrades any non-2xx to an empty list).
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid } = await params
  const comments = await listDesignPreviewComments(gate.ctx, id, cid)
  if (comments === null) {
    return apiError(404, "NOT_FOUND", "conversation not found")
  }
  return NextResponse.json({ comments })
}

// POST /api/design/projects/[id]/conversations/[cid]/comments
//
// Daemon shape: `{ comment }`. Upsert keyed on the comment target; 400 on
// malformed input, 404 when the conversation isn't found / not owned.
export async function POST(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id, cid } = await params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid JSON body")
  }

  try {
    const comment = await upsertDesignPreviewComment(gate.ctx, id, cid, body)
    if (comment === null) {
      return apiError(404, "NOT_FOUND", "conversation not found")
    }
    return NextResponse.json({ comment })
  } catch (err) {
    if (err instanceof PreviewCommentInputError) {
      return apiError(400, "BAD_REQUEST", err.message)
    }
    throw err
  }
}
