import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { aliveDocumentRelation, aliveDocumentWhere } from "@/features/knowledge/documents/where-alive"
import { expandGroupIds } from "@/features/knowledge/groups/tree"

export async function listKnowledgeGroupsByOrganization(organizationId: string | null) {
  return prisma.knowledgeBaseGroup.findMany({
    where: organizationId
      ? {
          OR: [{ organizationId }, { organizationId: null }],
        }
      : { organizationId: null },
    // Name order within the whole list; the tree builder re-nests, and siblings
    // keep this order because it preserves input order among children.
    orderBy: { name: "asc" },
    include: {
      _count: {
        // Soft-deleted documents (deletedAt set) must not inflate the
        // per-KB count the sidebar and Agent Builder render; the join
        // row stays so restore still works, but the count hides it.
        select: { documents: aliveDocumentRelation },
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
  // Expanded for the same reason retrieval expands: a selected KB stands for
  // its whole subtree. If this directory listed only the directly-attached
  // documents, the prompt would tell the model a nested document does not
  // exist while retrieval was busy quoting it.
  const scope = await expandGroupIds(groupIds)
  return prisma.document.findMany({
    where: {
      ...aliveDocumentWhere,
      groups: { some: { groupId: { in: scope } } },
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

/**
 * KB id/name + count of alive (non-soft-deleted) documents, org-scoped.
 * Owns the Prisma shape so callers never need `aliveDocumentRelation`.
 */
export async function findKnowledgeGroupSummaries(organizationId: string | null) {
  const groups = await prisma.knowledgeBaseGroup.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      parentId: true,
      _count: { select: { documents: aliveDocumentRelation } },
    },
  })
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    parentId: g.parentId,
    docCount: g._count.documents,
  }))
}
