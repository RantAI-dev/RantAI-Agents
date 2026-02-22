import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

// GET /api/dashboard/skills - List all org skills
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    const skills = await prisma.skill.findMany({
      where: {
        organizationId: orgContext?.organizationId || null,
      },
      include: {
        _count: { select: { assistantSkills: true } },
      },
      orderBy: [{ category: "asc" }, { displayName: "asc" }],
    })

    return NextResponse.json(
      skills.map((s) => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        description: s.description,
        content: s.content,
        source: s.source,
        sourceUrl: s.sourceUrl,
        version: s.version,
        category: s.category,
        tags: s.tags,
        metadata: s.metadata,
        enabled: s.enabled,
        assistantCount: s._count.assistantSkills,
        createdAt: s.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error("[Skills API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 })
  }
}

// POST /api/dashboard/skills - Create skill
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()

    const { name, displayName, description, content, source, sourceUrl, version, category, tags, metadata } = body

    if (!name || !displayName || !content) {
      return NextResponse.json(
        { error: "name, displayName, and content are required" },
        { status: 400 }
      )
    }

    const skill = await prisma.skill.create({
      data: {
        name,
        displayName,
        description: description || "",
        content,
        source: source || "custom",
        sourceUrl: sourceUrl || null,
        version: version || null,
        category: category || "general",
        tags: tags || [],
        metadata: metadata || null,
        enabled: true,
        organizationId: orgContext?.organizationId || null,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(skill, { status: 201 })
  } catch (error) {
    console.error("[Skills API] POST error:", error)
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 })
  }
}
