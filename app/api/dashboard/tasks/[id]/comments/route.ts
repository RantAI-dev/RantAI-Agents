import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { proxyGetComments, proxyAddComment } from "@/lib/digital-employee/task-aggregator"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const comments = await proxyGetComments(id)

  return NextResponse.json(comments)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgCtx = await getOrganizationContext(request, session.user.id)
  if (!orgCtx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  if (!body.content || typeof body.content !== "string" || body.content.trim() === "") {
    return NextResponse.json({ error: "content is required" }, { status: 400 })
  }

  const comment = await proxyAddComment(
    id,
    {
      content: body.content,
      author_type: "HUMAN",
      author_user_id: session.user.id,
    },
    orgCtx.organizationId,
  )

  if (!comment) {
    return NextResponse.json({ error: "Failed to add comment" }, { status: 502 })
  }

  return NextResponse.json(comment, { status: 201 })
}
