import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PUT - Update category
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
    const category = await prisma.category.findUnique({
      where: { id },
    })

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    const { label, color } = await request.json()

    // If label is being changed, update the name too (but only for non-system categories)
    let newName = category.name
    if (label && label !== category.label && !category.isSystem) {
      newName = label
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "")

      // Check if new name already exists
      const existing = await prisma.category.findFirst({
        where: { name: newName, NOT: { id } },
      })
      if (existing) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(label && !category.isSystem && { name: newName, label }),
        ...(color && { color }),
      },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      label: updated.label,
      color: updated.color,
      isSystem: updated.isSystem,
    })
  } catch (error) {
    console.error("Failed to update category:", error)
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    )
  }
}

// DELETE - Delete a category
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
    const category = await prisma.category.findUnique({
      where: { id },
    })

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    if (category.isSystem) {
      return NextResponse.json(
        { error: "Cannot delete system categories" },
        { status: 400 }
      )
    }

    await prisma.category.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete category:", error)
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    )
  }
}
