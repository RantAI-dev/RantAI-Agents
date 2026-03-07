import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string; goalId: string }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, goalId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { name, target, unit, period, currentValue, status } = await req.json()

    const goal = await prisma.employeeGoal.update({
      where: { id: goalId },
      data: {
        ...(name !== undefined && { name }),
        ...(target !== undefined && { target: Number(target) }),
        ...(unit !== undefined && { unit }),
        ...(period !== undefined && { period }),
        ...(currentValue !== undefined && { currentValue: Number(currentValue) }),
        ...(status !== undefined && { status }),
      },
    })

    return NextResponse.json(goal)
  } catch (error) {
    console.error("Failed to update goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id, goalId } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: { id, ...(orgContext ? { organizationId: orgContext.organizationId } : {}) },
    })
    if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.employeeGoal.delete({ where: { id: goalId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete goal:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
