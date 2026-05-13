import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function listKnowledgeDocumentsByScope(params: {
  organizationId: string | null
  groupId: string | null
  /** Include soft-deleted (trash) rows. Default false. */
  includeDeleted?: boolean
}) {
  // The list view doesn't render the extracted body — keep `content` out of the
  // SELECT so we don't ship hundreds of KB of text per row across the SSR boundary.
  return prisma.document.findMany({
    where: {
      ...(params.includeDeleted ? {} : { deletedAt: null }),
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

/**
 * Soft delete: set deletedAt instead of removing the row. Chunks in SurrealDB
 * are NOT cleaned up here — they're filtered out at retrieval via document_id
 * → Postgres lookup. The retention sweep is what eventually hard-deletes.
 */
export async function softDeleteKnowledgeDocument(id: string) {
  return prisma.document.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

/** Restore a soft-deleted document. */
export async function restoreKnowledgeDocument(id: string) {
  return prisma.document.update({
    where: { id },
    data: { deletedAt: null },
  })
}

/**
 * Coverage analytics: bump retrievalCount + lastRetrievedAt for every doc
 * that surfaced in a chat retrieval. Fire-and-forget — never blocks the chat
 * path, errors are logged and swallowed.
 */
export function recordRetrievalHits(documentIds: string[]): void {
  if (!documentIds.length) return
  void prisma.document
    .updateMany({
      where: { id: { in: [...new Set(documentIds)] } },
      data: {
        retrievalCount: { increment: 1 },
        lastRetrievedAt: new Date(),
      },
    })
    .catch((err) => console.warn("[knowledge] recordRetrievalHits failed:", err))
}

/**
 * Docs that never surfaced in retrieval (or haven't recently). Org-scoped.
 * Pass `staleAfterDays` to also include docs whose lastRetrievedAt is older
 * than that threshold.
 */
export async function listColdDocuments(params: {
  organizationId: string | null
  staleAfterDays?: number
  limit?: number
}) {
  const { organizationId, staleAfterDays, limit = 100 } = params
  const cutoff = staleAfterDays
    ? new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000)
    : null
  return prisma.document.findMany({
    where: {
      deletedAt: null,
      ...(organizationId !== null
        ? { OR: [{ organizationId }, { organizationId: null }] }
        : { organizationId: null }),
      OR: [
        { retrievalCount: 0 },
        ...(cutoff ? [{ lastRetrievedAt: { lt: cutoff } }] : []),
      ],
    },
    orderBy: [{ retrievalCount: "asc" }, { lastRetrievedAt: "asc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      retrievalCount: true,
      lastRetrievedAt: true,
      createdAt: true,
    },
  })
}
