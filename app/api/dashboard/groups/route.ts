import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const groups = await prisma.employeeGroup.findMany({
      where: {
        organizationId: orgContext.organizationId,
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    const result = groups.map((g) => ({
      ...g,
      memberCount: g.members.length,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch groups:", error)
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.create")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const group = await prisma.employeeGroup.create({
      data: {
        organizationId: orgContext.organizationId,
        name,
        description: description || null,
        createdBy: session.user.id,
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    })

    return NextResponse.json({
      ...group,
      memberCount: group.members.length,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error("Failed to create group:", error)
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 })
  }
}
