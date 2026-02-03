import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Get a single document with chunks
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
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
          select: {
            id: true,
            content: true,
            chunkIndex: true,
            createdAt: true,
          },
        },
        groups: {
          include: {
            group: {
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
    })

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: document.id,
      title: document.title,
      content: document.content,
      categories: document.categories,
      subcategory: document.subcategory,
      groups: document.groups.map((dg) => dg.group),
      metadata: document.metadata,
      chunks: document.chunks,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    })
  } catch (error) {
    console.error("Failed to get document:", error)
    return NextResponse.json(
      { error: "Failed to get document" },
      { status: 500 }
    )
  }
}

// PUT - Update document metadata, categories, and groups
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
    const { title, categories, subcategory, groupIds } = await request.json()

    // Start a transaction to update document and groups
    const document = await prisma.$transaction(async (tx) => {
      // Update document fields
      const updatedDoc = await tx.document.update({
        where: { id },
        data: {
          ...(title && { title }),
          ...(categories && { categories }),
          ...(subcategory !== undefined && { subcategory: subcategory || null }),
        },
      })

      // If groupIds is provided, update the groups
      if (groupIds !== undefined) {
        // Delete existing group associations
        await tx.documentGroup.deleteMany({
          where: { documentId: id },
        })

        // Create new group associations
        if (groupIds.length > 0) {
          await tx.documentGroup.createMany({
            data: groupIds.map((groupId: string) => ({
              documentId: id,
              groupId,
            })),
          })
        }
      }

      // Fetch the updated document with groups
      return tx.document.findUnique({
        where: { id },
        include: {
          groups: {
            include: {
              group: {
                select: { id: true, name: true, color: true },
              },
            },
          },
        },
      })
    })

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: document.id,
      title: document.title,
      categories: document.categories,
      subcategory: document.subcategory,
      groups: document.groups.map((dg) => dg.group),
    })
  } catch (error) {
    console.error("Failed to update document:", error)
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    )
  }
}

// DELETE - Delete a document and its chunks
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
    // Delete document (chunks and group associations will cascade delete)
    await prisma.document.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete document:", error)
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    )
  }
}
