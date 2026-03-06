import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { installClawHubSkill } from "@/lib/digital-employee/clawhub"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - List installed skills (platform + ClawHub)
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      include: {
        assistant: {
          include: {
            skills: { include: { skill: true } },
          },
        },
        installedSkills: { orderBy: { createdAt: "desc" } },
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({
      platform: (employee.assistant?.skills ?? []).map((s) => ({
        id: s.skill.id,
        name: s.skill.displayName || s.skill.name,
        description: s.skill.description,
        source: "platform",
        enabled: s.enabled,
        icon: s.skill.source === "openclaw" ? "🐾" : "📝",
        category: s.skill.source,
        tags: [],
      })),
      clawhub: employee.installedSkills,
    })
  } catch (error) {
    console.error("Failed to fetch skills:", error)
    return NextResponse.json({ error: "Failed to fetch skills" }, { status: 500 })
  }
}

// POST - Install a ClawHub skill
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { slug, source } = await req.json()

    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 })
    }

    if (source === "clawhub") {
      const skill = await installClawHubSkill(id, slug, session.user.id)
      return NextResponse.json(skill, { status: 201 })
    }

    return NextResponse.json({ error: "Unsupported source" }, { status: 400 })
  } catch (error) {
    console.error("Failed to install skill:", error)
    const msg = error instanceof Error ? error.message : "Failed to install skill"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
