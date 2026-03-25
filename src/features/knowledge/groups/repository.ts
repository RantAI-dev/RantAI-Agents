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
        select: { documents: true },
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
