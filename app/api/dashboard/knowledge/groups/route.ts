import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit } from "@/lib/organization"

// GET - List all groups
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get organization context
    const orgContext = await getOrganizationContext(request, session.user.id)

    const groups = await prisma.knowledgeBaseGroup.findMany({
      where: orgContext
        ? { organizationId: orgContext.organizationId }
        : { organizationId: null },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    })

    return NextResponse.json({
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        documentCount: group._count.documents,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Failed to list groups:", error)
    return NextResponse.json(
      { error: "Failed to list groups" },
      { status: 500 }
    )
  }
}

// POST - Create a new group
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get organization context
    const orgContext = await getOrganizationContext(request, session.user.id)

    // Check permission if organization context exists
    if (orgContext && !canEdit(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const { name, description, color } = await request.json()

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const group = await prisma.knowledgeBaseGroup.create({
      data: {
        name,
        description: description || null,
        color: color || null,
        organizationId: orgContext?.organizationId || null,
      },
    })

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
    })
  } catch (error) {
    console.error("Failed to create group:", error)
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    )
  }
}
