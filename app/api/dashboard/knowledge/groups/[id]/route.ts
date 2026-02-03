import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Get a single group with documents
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const group = await prisma.knowledgeBaseGroup.findUnique({
      where: { id },
      include: {
        documents: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
      },
    })

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      documents: group.documents,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("Failed to get group:", error)
    return NextResponse.json(
      { error: "Failed to get group" },
      { status: 500 }
    )
  }
}

// PUT - Update group
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const { name, description, color } = await request.json()

    const group = await prisma.knowledgeBaseGroup.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(color !== undefined && { color: color || null }),
      },
    })

    return NextResponse.json({
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
    })
  } catch (error) {
    console.error("Failed to update group:", error)
    return NextResponse.json(
      { error: "Failed to update group" },
      { status: 500 }
    )
  }
}

// DELETE - Delete a group (documents will have groupId set to null)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    await prisma.knowledgeBaseGroup.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete group:", error)
    return NextResponse.json(
      { error: "Failed to delete group" },
      { status: 500 }
    )
  }
}
