import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function listKnowledgeDocumentsByScope(params: {
  organizationId: string | null
  groupId: string | null
}) {
  // The list view doesn't render the extracted body — keep `content` out of the
  // SELECT so we don't ship hundreds of KB of text per row across the SSR boundary.
  return prisma.document.findMany({
    where: {
      ...(params.groupId ? { groups: { some: { groupId: params.groupId } } } : {}),
      ...(params.organizationId !== null
        ? { OR: [{ organizationId: params.organizationId }, { organizationId: null }] }
        : { organizationId: null }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      categories: true,
      subcategory: true,
      fileType: true,
      metadata: true,
      artifactType: true,
      fileSize: true,
      mimeType: true,
      s3Key: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
      groups: {
        select: {
          group: {
            select: { id: true, name: true, color: true },
          },
        },
      },
    },
  })
}

export async function findKnowledgeDocumentById(id: string) {
  return prisma.document.findUnique({
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
}

export async function findKnowledgeDocumentAccessById(id: string) {
  return prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      s3Key: true,
    },
  })
}

export async function createKnowledgeDocument(data: Prisma.DocumentCreateArgs["data"]) {
  return prisma.document.create({
    data,
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
}

export async function updateKnowledgeDocumentWithGroups(
  id: string,
  data: Prisma.DocumentUpdateInput,
  groupIds?: string[]
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.document.update({
      where: { id },
      data,
    })

    if (groupIds !== undefined) {
      await tx.documentGroup.deleteMany({
        where: { documentId: id },
      })

      if (groupIds.length > 0) {
        await tx.documentGroup.createMany({
          data: groupIds.map((groupId) => ({
            documentId: id,
            groupId,
          })),
        })
      }
    }

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
}

export async function deleteKnowledgeDocument(id: string) {
  return prisma.document.delete({
    where: { id },
  })
}
