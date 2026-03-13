import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { proxySubmitReview } from "@/lib/digital-employee/task-aggregator"

const VALID_ACTIONS = ["approve", "changes", "reject"] as const
type ReviewAction = (typeof VALID_ACTIONS)[number]

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

  if (!body.action || !VALID_ACTIONS.includes(body.action as ReviewAction)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 },
    )
  }

  const task = await proxySubmitReview(
    id,
    { ...body, actor_type: "HUMAN", actor_user_id: session.user.id },
    orgCtx.organizationId,
  )

  if (!task) {
    return NextResponse.json({ error: "Review submission failed" }, { status: 502 })
  }

  return NextResponse.json(task)
}
