import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { RespondApprovalSchema } from "@/src/features/digital-employees/approvals/schema"
import { respondToDashboardApproval } from "@/src/features/digital-employees/approvals/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const parsed = RespondApprovalSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await respondToDashboardApproval({
      id,
      userId: session.user.id,
      input: parsed.data,
    })
    if ("status" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to respond to approval:", error)
    return NextResponse.json({ error: "Failed to respond" }, { status: 500 })
  }
}
