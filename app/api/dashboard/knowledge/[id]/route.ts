import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canEdit, canManage } from "@/lib/organization"
import { getSurrealClient } from "@/lib/surrealdb"
import { getPresignedDownloadUrl, deleteFile } from "@/lib/s3"

interface SurrealChunk {
  id: string;
  content: string;
  chunk_index: number;
  created_at: string;
}

// GET - Get a single document with chunks
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const orgContext = await getOrganizationContext(request, session.user.id)

  try {
    const document = await prisma.document.findUnique({
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

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Verify organization access
    if (document.organizationId) {
      if (!orgContext || document.organizationId !== orgContext.organizationId) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 })
      }
    } else if (orgContext) {
      // Document has no org but user is requesting with org context
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Fetch chunks from SurrealDB
    const surrealClient = await getSurrealClient()
    const chunkResults = await surrealClient.query<SurrealChunk>(
      `SELECT id, content, chunk_index, created_at FROM document_chunk WHERE document_id = $document_id ORDER BY chunk_index ASC`,
      { document_id: id }
    )
    // SurrealDB JS library returns results directly as arrays, not wrapped in {result: [...]}
    const rawResult = chunkResults[0]
    const chunks = (Array.isArray(rawResult) ? rawResult : (rawResult as { result?: SurrealChunk[] })?.result || []) as SurrealChunk[]

    // Generate presigned URL if document has S3 file
    let fileUrl: string | undefined
    if (document.s3Key) {
      try {
        fileUrl = await getPresignedDownloadUrl(document.s3Key)
      } catch (urlError) {
        console.error("[Knowledge API] Failed to generate presigned URL:", urlError)
      }
    }

    // Determine file type from new schema field or legacy metadata
    const fileType = document.fileType || (document.metadata as { fileType?: string } | null)?.fileType || "markdown"

    return NextResponse.json({
      id: document.id,
      title: document.title,
      content: document.content,
      categories: document.categories,
      subcategory: document.subcategory,
      groups: document.groups.map((dg) => dg.group),
      metadata: document.metadata,
      // New S3 fields
      fileType,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      s3Key: document.s3Key,
      fileUrl,
      // Chunks
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        chunkIndex: chunk.chunk_index,
        createdAt: chunk.created_at,
      })),
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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const orgContext = await getOrganizationContext(request, session.user.id)

  try {
    // First verify the document exists and check organization access
    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Verify organization access
    if (existing.organizationId) {
      if (!orgContext || existing.organizationId !== orgContext.organizationId) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 })
      }

      // Check edit permission
      if (!canEdit(orgContext.membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      }
    }

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

// DELETE - Delete a document, its chunks, entities, and relations
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const orgContext = await getOrganizationContext(request, session.user.id)

  try {
    // First verify the document exists and check organization access
    const existing = await prisma.document.findUnique({
      where: { id },
      select: { id: true, organizationId: true, s3Key: true },
    })

    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Verify organization access
    if (existing.organizationId) {
      if (!orgContext || existing.organizationId !== orgContext.organizationId) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 })
      }

      // Only owner and admin can delete
      if (!canManage(orgContext.membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      }
    }

    const surrealClient = await getSurrealClient()

    // Clean up all document intelligence data (relations, entities, chunks)
    const cleanupStats = await surrealClient.cleanupDocumentIntelligence(id)

    // Delete S3 file if present
    if (existing.s3Key) {
      try {
        await deleteFile(existing.s3Key)
        console.log(`[Knowledge API] Deleted S3 file: ${existing.s3Key}`)
      } catch (s3Error) {
        console.error(`[Knowledge API] Failed to delete S3 file ${existing.s3Key}:`, s3Error)
        // Continue with document deletion even if S3 delete fails
      }
    }

    // Delete document from PostgreSQL (group associations will cascade delete)
    await prisma.document.delete({
      where: { id },
    })

    console.log(`Deleted document ${id}: cleaned up relations from ${cleanupStats.deletedRelationTables} tables, entities: ${cleanupStats.entitiesDeleted}, chunks: ${cleanupStats.chunksDeleted}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete document:", error)
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    )
  }
}
