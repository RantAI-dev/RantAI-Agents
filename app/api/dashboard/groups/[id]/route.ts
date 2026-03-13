import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/dashboard/groups/:id
export async function GET(req: Request, { params }: RouteParams) {
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

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    return NextResponse.json(group)
  } catch (error) {
    console.error("Failed to fetch group:", error)
    return NextResponse.json({ error: "Failed to fetch group" }, { status: 500 })
  }
}

// PATCH /api/dashboard/groups/:id
export async function PATCH(req: Request, { params }: RouteParams) {
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

    const existing = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
    })
    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    if (existing.status !== "IDLE" && existing.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Cannot update group while it is deploying or stopping" },
        { status: 409 }
      )
    }

    const body = await req.json()
    const { name, description, isImplicit } = body

    const updated = await prisma.employeeGroup.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isImplicit !== undefined && { isImplicit }),
      },
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

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update group:", error)
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 })
  }
}

// DELETE /api/dashboard/groups/:id
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

    if (!hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const existing = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
      include: { members: { select: { id: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    if (existing.status !== "IDLE") {
      return NextResponse.json(
        { error: "Cannot delete group with a running container. Stop it first." },
        { status: 409 }
      )
    }

    // Block deletion if group has members — they must be moved first
    if (existing.members.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete team with members. Move or remove members first." },
        { status: 409 }
      )
    }

    // Safe to delete — no members
    await prisma.employeeGroup.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete group:", error)
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 })
  }
}
