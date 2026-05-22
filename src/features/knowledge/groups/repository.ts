import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function listKnowledgeGroupsByOrganization(organizationId: string | null) {
  return prisma.knowledgeBaseGroup.findMany({
    where: organizationId
      ? {
          OR: [{ organizationId }, { organizationId: null }],
        }
      : { organizationId: null },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          // Soft-deleted documents (deletedAt set) must not inflate the
          // per-KB count the sidebar and Agent Builder render; the join
          // row stays so restore still works, but the count hides it.
          documents: { where: { document: { deletedAt: null } } },
        },
      },
    },
  })
}

export async function createKnowledgeGroup(data: Prisma.KnowledgeBaseGroupCreateArgs["data"]) {
  return prisma.knowledgeBaseGroup.create({
    data,
  })
}

export async function findKnowledgeGroupById(id: string) {
  return prisma.knowledgeBaseGroup.findUnique({
    where: { id },
    include: {
      documents: {
        include: {
          document: {
            select: {
              id: true,
              title: true,
              categories: true,
            },
          },
        },
      },
    },
  })
}

export async function findKnowledgeGroupAccessById(id: string) {
  return prisma.knowledgeBaseGroup.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
    },
  })
}

export async function updateKnowledgeGroup(
  id: string,
  data: Prisma.KnowledgeBaseGroupUpdateInput
) {
  return prisma.knowledgeBaseGroup.update({
    where: { id },
    data,
  })
}

export async function deleteKnowledgeGroup(id: string) {
  return prisma.knowledgeBaseGroup.delete({
    where: { id },
  })
}

/**
 * Lightweight listing of every document linked to any of the given groups.
 * Used to inject a "## Available Documents" directory into the chat system
 * prompt so the LLM can answer enumerate-style queries ("list semua PSAK")
 * without depending on whether semantic retrieval happened to surface one
 * chunk per doc. Returns at most `cap` rows; the chat path treats a full cap
 * as "directory too large, skip injection".
 */
export async function findDocumentsByGroups(groupIds: string[], cap = 200) {
  if (!groupIds.length) return []
  return prisma.document.findMany({
    where: {
      groups: { some: { groupId: { in: groupIds } } },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      categories: true,
      subcategory: true,
    },
    orderBy: { title: "asc" },
    take: cap,
  })
}
