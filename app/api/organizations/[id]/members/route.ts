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

// GET /api/organizations/[id]/members - List all members
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: organizationId } = await params

    // Verify membership
    const membership = await getMembership(session.user.id, organizationId)
    if (!membership || !membership.acceptedAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: [
        { role: "asc" }, // owner first, then admin, member, viewer
        { acceptedAt: "asc" },
      ],
    })

    return NextResponse.json(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.userEmail,
        name: m.userName,
        role: m.role,
        invitedBy: m.invitedBy,
        invitedAt: m.invitedAt.toISOString(),
        acceptedAt: m.acceptedAt?.toISOString() || null,
        isPending: !m.acceptedAt,
      }))
    )
  } catch (error) {
    console.error("[Members API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    )
  }
}

// POST /api/organizations/[id]/members - Invite a new member
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: organizationId } = await params

    // Verify admin or owner membership
    const membership = await getMembership(session.user.id, organizationId)
    if (!membership || !membership.acceptedAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    if (!["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { email, role = "member" } = body

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
    }

    // Validate role
    const validRoles = ["admin", "member", "viewer"]
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Check organization limits
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: { select: { memberships: true } },
      },
    })

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    if (organization.plan === "free") {
      return NextResponse.json(
        { error: "Organization management requires a paid plan. Please upgrade." },
        { status: 403 }
      )
    }

    if (organization._count.memberships >= organization.maxMembers) {
      return NextResponse.json(
        { error: `Organization has reached the maximum of ${organization.maxMembers} members` },
        { status: 400 }
      )
    }

    // Check if email is already a member or invited
    const existingMember = await prisma.organizationMember.findFirst({
      where: {
        organizationId,
        userEmail: email.toLowerCase(),
      },
    })

    if (existingMember) {
      return NextResponse.json(
        { error: "This email is already a member or has a pending invite" },
        { status: 400 }
      )
    }

    // Look up user by email
    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

    const userId = existingUser?.id
    const userName = existingUser?.name || null

    const member = await prisma.organizationMember.create({
      data: {
        userId: userId || `pending-${Date.now()}`, // Temporary ID for pending invites
        userEmail: email.toLowerCase(),
        userName,
        organizationId,
        role,
        invitedBy: session.user.id,
        acceptedAt: userId ? new Date() : null, // Auto-accept if user exists
      },
    })

    return NextResponse.json({
      id: member.id,
      userId: member.userId,
      email: member.userEmail,
      name: member.userName,
      role: member.role,
      invitedBy: member.invitedBy,
      invitedAt: member.invitedAt.toISOString(),
      acceptedAt: member.acceptedAt?.toISOString() || null,
      isPending: !member.acceptedAt,
    })
  } catch (error) {
    console.error("[Members API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to invite member" },
      { status: 500 }
    )
  }
}
