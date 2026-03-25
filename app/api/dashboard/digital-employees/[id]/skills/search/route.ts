import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardDigitalEmployeeSkillSearchQuerySchema,
} from "@/src/features/digital-employees/interactions/schema"
import {
  isServiceError,
  searchDigitalEmployeeSkills,
} from "@/src/features/digital-employees/interactions/service"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    const url = new URL(req.url)
    const parsed = DashboardDigitalEmployeeSkillSearchQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await searchDigitalEmployeeSkills({
      id,
      organizationId: orgContext?.organizationId ?? null,
      query: parsed.data,
    })
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("ClawHub search failed:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
