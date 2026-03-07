import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { computeGoalProgress, resetGoalsForNewPeriod } from "@/lib/digital-employee/goals"

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
      select: { id: true },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const goals = await prisma.employeeGoal.findMany({
      where: { digitalEmployeeId: id, status: "active" },
      orderBy: { createdAt: "desc" },
    })

    // Check for period resets
    const resetIds = resetGoalsForNewPeriod(goals)
    if (resetIds.length > 0) {
      await prisma.employeeGoal.updateMany({
        where: { id: { in: resetIds } },
        data: { currentValue: 0 },
      })
    }

    const goalsWithProgress = goals.map((g) => ({
      ...g,
      currentValue: resetIds.includes(g.id) ? 0 : g.currentValue,
      ...computeGoalProgress({
        type: g.type,
        currentValue: resetIds.includes(g.id) ? 0 : g.currentValue,
        target: g.target,
      }),
    }))

    return NextResponse.json(goalsWithProgress)
  } catch (error) {
    console.error("Failed to fetch goals:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { name, type, target, unit, period, source, autoTrackConfig } = await req.json()
    if (!name || !type || target == null || !unit || !period) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const goal = await prisma.employeeGoal.create({
      data: {
        digitalEmployeeId: id,
        name,
        type,
        target: Number(target),
        unit,
        period,
        source: source || "manual",
        autoTrackConfig: autoTrackConfig || undefined,
      },
    })

    return NextResponse.json(goal, { status: 201 })
  } catch (error) {
    console.error("Failed to create goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
