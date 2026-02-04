import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Helper to generate URL-friendly slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

// GET /api/organizations - List all organizations for the current user
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get organizations where user is a member
    const memberships = await prisma.organizationMember.findMany({
      where: {
        userId: session.user.id,
        acceptedAt: { not: null }, // Only accepted memberships
      },
      include: {
        organization: {
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
        },
      },
      orderBy: { organization: { name: "asc" } },
    })

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      logoUrl: m.organization.logoUrl,
      plan: m.organization.plan,
      role: m.role,
      limits: {
        maxMembers: m.organization.maxMembers,
        maxAssistants: m.organization.maxAssistants,
        maxDocuments: m.organization.maxDocuments,
        maxApiKeys: m.organization.maxApiKeys,
      },
      counts: {
        members: m.organization._count.memberships,
        assistants: m.organization._count.assistants,
        documents: m.organization._count.documents,
        apiKeys: m.organization._count.embedKeys,
      },
      createdAt: m.organization.createdAt.toISOString(),
      joinedAt: m.acceptedAt?.toISOString(),
    }))

    return NextResponse.json(organizations)
  } catch (error) {
    console.error("[Organizations API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 }
    )
  }
}

// POST /api/organizations - Create a new organization
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { name, slug: customSlug } = body

    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Organization name must be at least 2 characters" },
        { status: 400 }
      )
    }

    // Generate or validate slug
    let slug = customSlug?.trim() || generateSlug(name)

    // Check if slug is unique
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    })

    if (existingOrg) {
      // Append random suffix if slug exists
      slug = `${slug}-${Math.random().toString(36).substring(2, 6)}`
    }

    // Create organization with the user as owner
    const organization = await prisma.organization.create({
      data: {
        name: name.trim(),
        slug,
        memberships: {
          create: {
            userId: session.user.id,
            userEmail: session.user.email,
            userName: session.user.name || undefined,
            role: "owner",
            acceptedAt: new Date(),
          },
        },
      },
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

    return NextResponse.json({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logoUrl: organization.logoUrl,
      plan: organization.plan,
      role: "owner",
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
    })
  } catch (error) {
    console.error("[Organizations API] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    )
  }
}
