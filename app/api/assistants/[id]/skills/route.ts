import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/assistants/[id]/skills - Get assistant's enabled skills
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const bindings = await prisma.assistantSkill.findMany({
      where: { assistantId: id, enabled: true },
      include: {
        skill: {
          select: { displayName: true, description: true, icon: true },
        },
      },
      orderBy: { priority: "asc" },
    })

    return NextResponse.json(
      bindings.map((b) => ({
        id: b.skillId,
        displayName: b.skill.displayName,
        description: b.skill.description,
        icon: b.skill.icon,
        enabled: b.enabled,
      }))
    )
  } catch (error) {
    console.error("[Assistant Skills API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant skills" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/skills - Set assistant's enabled skills
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { skillIds } = body as { skillIds: string[] }

    if (!Array.isArray(skillIds)) {
      return NextResponse.json(
        { error: "skillIds must be an array" },
        { status: 400 }
      )
    }

    // Filter out null/undefined/empty values
    const validSkillIds = skillIds.filter((id): id is string => typeof id === "string" && id.length > 0)

    const assistant = await prisma.assistant.findUnique({ where: { id } })
    if (!assistant) {
      return NextResponse.json({ error: "Assistant not found" }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.assistantSkill.deleteMany({ where: { assistantId: id } })
      if (validSkillIds.length > 0) {
        await tx.assistantSkill.createMany({
          data: validSkillIds.map((skillId: string, index: number) => ({
            assistantId: id,
            skillId,
            priority: index,
          })),
        })
      }
    })

    const updated = await prisma.assistantSkill.findMany({
      where: { assistantId: id },
      select: {
        id: true,
        skillId: true,
        enabled: true,
        priority: true,
      },
      orderBy: { priority: "asc" },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("[Assistant Skills API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant skills" },
      { status: 500 }
    )
  }
}
