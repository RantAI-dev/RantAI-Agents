import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/dashboard/groups/:id/members — add member(s) to group
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const group = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
    })
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    const body = await req.json()
    const { employeeIds } = body as { employeeIds: string[] }

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json(
        { error: "employeeIds must be a non-empty array" },
        { status: 400 }
      )
    }

    // Fetch all referenced employees in one query
    const employees = await prisma.digitalEmployee.findMany({
      where: {
        id: { in: employeeIds },
        organizationId: orgContext.organizationId,
      },
      select: { id: true, name: true, groupId: true, status: true },
    })

    // Check all employees exist in this org
    if (employees.length !== employeeIds.length) {
      const foundIds = new Set(employees.map((e) => e.id))
      const missing = employeeIds.filter((eid) => !foundIds.has(eid))
      return NextResponse.json(
        { error: `Employees not found in this organization: ${missing.join(", ")}` },
        { status: 404 }
      )
    }

    // Validate each employee — groupId is required, so check they're not in a different group
    for (const emp of employees) {
      if (emp.groupId && emp.groupId !== id) {
        return NextResponse.json(
          {
            error: `Employee "${emp.name}" (${emp.id}) is already in another group. Remove them first.`,
          },
          { status: 409 }
        )
      }
    }

    // Update all employees' groupId
    await prisma.digitalEmployee.updateMany({
      where: { id: { in: employeeIds } },
      data: { groupId: id },
    })

    // Return updated member list
    const updatedGroup = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            status: true,
            avatar: true,
          },
        },
      },
    })

    return NextResponse.json(updatedGroup)
  } catch (error) {
    console.error("Failed to add group members:", error)
    return NextResponse.json({ error: "Failed to add group members" }, { status: 500 })
  }
}

// DELETE /api/dashboard/groups/:id/members — remove member(s) from group
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const group = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
    })
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    const body = await req.json()
    const { employeeIds } = body as { employeeIds: string[] }

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json(
        { error: "employeeIds must be a non-empty array" },
        { status: 400 }
      )
    }

    // For each removed employee, create a new implicit (solo) group and reassign
    const employeesInGroup = await prisma.digitalEmployee.findMany({
      where: { id: { in: employeeIds }, groupId: id },
      select: { id: true, name: true, organizationId: true },
    })

    for (const emp of employeesInGroup) {
      const soloGroup = await prisma.employeeGroup.create({
        data: {
          name: `${emp.name} (solo)`,
          organizationId: emp.organizationId,
          isImplicit: true,
          createdBy: session.user.id,
        },
      })
      await prisma.digitalEmployee.update({
        where: { id: emp.id },
        data: { groupId: soloGroup.id },
      })
    }

    // Return updated member list
    const updatedGroup = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            status: true,
            avatar: true,
          },
        },
      },
    })

    return NextResponse.json(updatedGroup)
  } catch (error) {
    console.error("Failed to remove group members:", error)
    return NextResponse.json({ error: "Failed to remove group members" }, { status: 500 })
  }
}
