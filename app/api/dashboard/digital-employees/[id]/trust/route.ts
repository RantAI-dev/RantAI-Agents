import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { computeTrustScore, suggestPromotion, shouldDemote, AUTONOMY_LEVELS, mapLegacyAutonomy } from "@/lib/digital-employee/trust"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const events = await prisma.employeeTrustEvent.findMany({
      where: { digitalEmployeeId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    })

    const trustScore = computeTrustScore(events)
    const currentLevel = mapLegacyAutonomy(employee.autonomyLevel)
    const promotionSuggestion = suggestPromotion(currentLevel, trustScore)
    const demotionSuggestion = shouldDemote(currentLevel, trustScore)

    return NextResponse.json({
      trustScore,
      currentLevel,
      levels: AUTONOMY_LEVELS,
      promotionSuggestion,
      demotionSuggestion,
      recentEvents: events.slice(0, 20).map((e) => ({
        id: e.id,
        eventType: e.eventType,
        weight: e.weight,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    })
  } catch (error) {
    console.error("Failed to fetch trust data:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
