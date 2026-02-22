import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import { resolveSkillReadiness } from "@/lib/skills/requirement-resolver"

// GET /api/dashboard/skills/[id]/readiness?assistantId=xxx
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: skillId } = await params
    const { searchParams } = new URL(req.url)
    const assistantId = searchParams.get("assistantId")

    if (!assistantId) {
      return NextResponse.json(
        { error: "assistantId query parameter is required" },
        { status: 400 }
      )
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const readiness = await resolveSkillReadiness(
      skillId,
      assistantId,
      orgContext?.organizationId
    )

    return NextResponse.json(readiness)
  } catch (error) {
    console.error("[Skills Readiness API] error:", error)
    return NextResponse.json(
      { error: "Failed to check skill readiness" },
      { status: 500 }
    )
  }
}
