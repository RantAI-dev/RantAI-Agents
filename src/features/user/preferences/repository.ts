import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findUserPreferencesByUserId(userId: string) {
  return prisma.userPreference.findUnique({
    where: { userId },
  })
}

export async function findAssistantById(assistantId: string) {
  return prisma.assistant.findUnique({
    where: { id: assistantId },
    select: { id: true },
  })
}

export async function upsertUserPreferences(params: {
  userId: string
  updateData: Prisma.UserPreferenceUpdateInput
  createData: Prisma.UserPreferenceCreateInput
}) {
  return prisma.userPreference.upsert({
    where: { userId: params.userId },
    update: params.updateData,
    create: params.createData,
  })
}
