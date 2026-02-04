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

// PATCH /api/organizations/[id]/members/[memberId] - Update member role
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: organizationId, memberId } = await params

    // Verify admin or owner membership
    const currentMembership = await getMembership(session.user.id, organizationId)
    if (!currentMembership || !currentMembership.acceptedAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    // Get target member
    const targetMember = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    })

    if (!targetMember || targetMember.organizationId !== organizationId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    const body = await req.json()
    const { role } = body

    // Validate role
    const validRoles = ["admin", "member", "viewer"]
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Permission checks
    if (targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change the owner's role" },
        { status: 403 }
      )
    }

    // Only owner can change roles
    if (currentMembership.role !== "owner") {
      return NextResponse.json(
        { error: "Only the owner can change member roles" },
        { status: 403 }
      )
    }

    const member = await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
    })

    return NextResponse.json({
      id: member.id,
      userId: member.userId,
      email: member.userEmail,
      name: member.userName,
      role: member.role,
      invitedAt: member.invitedAt.toISOString(),
      acceptedAt: member.acceptedAt?.toISOString() || null,
    })
  } catch (error) {
    console.error("[Member API] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    )
  }
}

// DELETE /api/organizations/[id]/members/[memberId] - Remove member
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: organizationId, memberId } = await params

    // Verify membership
    const currentMembership = await getMembership(session.user.id, organizationId)
    if (!currentMembership || !currentMembership.acceptedAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    // Get target member
    const targetMember = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    })

    if (!targetMember || targetMember.organizationId !== organizationId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Self-removal is allowed (leaving the organization)
    const isSelfRemoval = targetMember.userId === session.user.id

    if (!isSelfRemoval) {
      // Only owner and admin can remove others
      if (!["owner", "admin"].includes(currentMembership.role)) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 }
        )
      }

      // Admin cannot remove owner
      if (targetMember.role === "owner") {
        return NextResponse.json(
          { error: "Cannot remove the organization owner" },
          { status: 403 }
        )
      }

      // Admin cannot remove other admins (only owner can)
      if (targetMember.role === "admin" && currentMembership.role !== "owner") {
        return NextResponse.json(
          { error: "Only the owner can remove admins" },
          { status: 403 }
        )
      }
    }

    // Owner cannot leave (must transfer ownership first or delete org)
    if (isSelfRemoval && targetMember.role === "owner") {
      return NextResponse.json(
        { error: "Owner cannot leave. Transfer ownership first or delete the organization." },
        { status: 403 }
      )
    }

    await prisma.organizationMember.delete({
      where: { id: memberId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Member API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    )
  }
}
