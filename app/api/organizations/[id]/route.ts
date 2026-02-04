import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Helper to check membership and role
async function getMembership(userId: string, organizationId: string) {
  return prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  })
}

// GET /api/organizations/[id] - Get organization details
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify membership
    const membership = await getMembership(session.user.id, id)
    if (!membership || !membership.acceptedAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            memberships: true,
            assistants: true,
            documents: true,
            embedKeys: true,
          },
        },
      },
    })

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logoUrl: organization.logoUrl,
      plan: organization.plan,
      role: membership.role,
      limits: {
        maxMembers: organization.maxMembers,
        maxAssistants: organization.maxAssistants,
        maxDocuments: organization.maxDocuments,
        maxApiKeys: organization.maxApiKeys,
      },
      counts: {
        members: organization._count.memberships,
        assistants: organization._count.assistants,
        documents: organization._count.documents,
        apiKeys: organization._count.embedKeys,
      },
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("[Organization API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    )
  }
}

// PATCH /api/organizations/[id] - Update organization
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify admin or owner membership
    const membership = await getMembership(session.user.id, id)
    if (!membership || !membership.acceptedAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    if (!["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { name, logoUrl } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl

    const organization = await prisma.organization.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logoUrl: organization.logoUrl,
      plan: organization.plan,
      updatedAt: organization.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("[Organization API] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    )
  }
}

// DELETE /api/organizations/[id] - Delete organization
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify owner membership
    const membership = await getMembership(session.user.id, id)
    if (!membership || !membership.acceptedAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    if (membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can delete an organization" },
        { status: 403 }
      )
    }

    // Delete organization (cascades to members, assistants, etc.)
    await prisma.organization.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Organization API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete organization" },
      { status: 500 }
    )
  }
}
