import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findAssistantById(id: string) {
  return prisma.assistant.findUnique({
    where: { id },
  })
}

export async function listAssistantsByScope(organizationId: string | null) {
  return prisma.assistant.findMany({
    where: {
      OR: [
        { isBuiltIn: true },
        ...(organizationId ? [{ organizationId }] : [{ organizationId: null }]),
      ],
    },
    include: {
      _count: { select: { tools: true } },
    },
    orderBy: [{ isBuiltIn: "desc" }, { createdAt: "asc" }],
  })
}

export async function countAssistantsForOrganization(organizationId: string) {
  return prisma.assistant.count({
    where: { organizationId },
  })
}

export async function findOrganizationById(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      maxAssistants: true,
    },
  })
}

export async function createAssistant(
  data: Prisma.AssistantUncheckedCreateInput
) {
  return prisma.assistant.create({
    data,
  })
}

export async function updateAssistantById(
  id: string,
  data: Prisma.AssistantUpdateInput
) {
  return prisma.assistant.update({
    where: { id },
    data,
  })
}

export async function deleteAssistantById(id: string) {
  return prisma.assistant.delete({
    where: { id },
  })
}
