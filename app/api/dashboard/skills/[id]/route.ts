import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard/skills/[id]
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

    const skill = await prisma.skill.findUnique({
      where: { id },
      include: { _count: { select: { assistantSkills: true } } },
    })

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 })
    }

    return NextResponse.json(skill)
  } catch (error) {
    console.error("[Skills API] GET [id] error:", error)
    return NextResponse.json({ error: "Failed to fetch skill" }, { status: 500 })
  }
}

// PUT /api/dashboard/skills/[id]
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

    const skill = await prisma.skill.update({
      where: { id },
      data: {
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
      },
    })

    return NextResponse.json(skill)
  } catch (error) {
    console.error("[Skills API] PUT error:", error)
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 })
  }
}

// DELETE /api/dashboard/skills/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    await prisma.skill.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Skills API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 })
  }
}
