import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard/tools/[id]
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
    const tool = await prisma.tool.findUnique({
      where: { id },
      include: {
        mcpServer: { select: { id: true, name: true } },
        _count: { select: { assistantTools: true } },
      },
    })

    if (!tool) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }

    return NextResponse.json(tool)
  } catch (error) {
    console.error("[Tools API] GET [id] error:", error)
    return NextResponse.json(
      { error: "Failed to fetch tool" },
      { status: 500 }
    )
  }
}

// PUT /api/dashboard/tools/[id]
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
    const existing = await prisma.tool.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }

    const body = await req.json()
    const { displayName, description, parameters, executionConfig, enabled } =
      body

    const tool = await prisma.tool.update({
      where: { id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(description !== undefined && { description }),
        ...(parameters !== undefined && { parameters }),
        ...(executionConfig !== undefined && { executionConfig }),
        ...(enabled !== undefined && { enabled }),
      },
    })

    return NextResponse.json(tool)
  } catch (error) {
    console.error("[Tools API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update tool" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/tools/[id]
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
    const tool = await prisma.tool.findUnique({ where: { id } })

    if (!tool) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 })
    }

    if (tool.isBuiltIn) {
      return NextResponse.json(
        { error: "Cannot delete built-in tools" },
        { status: 403 }
      )
    }

    await prisma.tool.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Tools API] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to delete tool" },
      { status: 500 }
    )
  }
}
