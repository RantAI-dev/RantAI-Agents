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
    // User-created agents first (isBuiltIn=false sorts before true under asc),
    // then newest-first within each group so fresh creations land at the top
    // of the list instead of being buried below built-ins + older items.
    orderBy: [{ isBuiltIn: "asc" }, { createdAt: "desc" }],
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
