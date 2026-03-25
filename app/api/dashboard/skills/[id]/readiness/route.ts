import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardSkillIdParamsSchema,
  DashboardSkillReadinessQuerySchema,
} from "@/src/features/skills/schema"
import { getDashboardSkillReadiness } from "@/src/features/skills/service"

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

    const parsedParams = DashboardSkillIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid skill id" }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const parsedQuery = DashboardSkillReadinessQuerySchema.safeParse({
      assistantId: searchParams.get("assistantId") ?? undefined,
    })
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "assistantId query parameter is required" },
        { status: 400 }
      )
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const readiness = await getDashboardSkillReadiness({
      skillId: parsedParams.data.id,
      assistantId: parsedQuery.data.assistantId,
      organizationId: orgContext?.organizationId ?? null,
    })

    return NextResponse.json(readiness)
  } catch (error) {
    console.error("[Skills Readiness API] error:", error)
    return NextResponse.json(
      { error: "Failed to check skill readiness" },
      { status: 500 }
    )
  }
}
