import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationContext } from "@/lib/organization"
import {
  DashboardStatisticsQuerySchema,
} from "@/src/features/statistics/schema"
import {
  getDashboardStatistics,
} from "@/src/features/statistics/service"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const url = new URL(req.url)
    const parsed = DashboardStatisticsQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    return NextResponse.json(
      await getDashboardStatistics({
        organizationId: orgContext?.organizationId ?? null,
        query: parsed.data,
      })
    )
  } catch (error) {
    console.error("Failed to fetch statistics:", error)
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}
