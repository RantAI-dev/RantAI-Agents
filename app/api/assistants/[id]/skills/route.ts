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
      where: { assistantId: id },
      select: {
        id: true,
        skillId: true,
        enabled: true,
        priority: true,
      },
      orderBy: { priority: "asc" },
    })

    return NextResponse.json(bindings)
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

    const assistant = await prisma.assistant.findUnique({ where: { id } })
    if (!assistant) {
      return NextResponse.json({ error: "Assistant not found" }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.assistantSkill.deleteMany({ where: { assistantId: id } }),
      ...(skillIds.length > 0
        ? [
            prisma.assistantSkill.createMany({
              data: skillIds.map((skillId, index) => ({
                assistantId: id,
                skillId,
                priority: index,
              })),
            }),
          ]
        : []),
    ])

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
