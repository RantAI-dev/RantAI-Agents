import { prisma } from "@/lib/prisma"

export async function findUserPreferenceByUserId(userId: string) {
  return prisma.userPreference.findUnique({
    where: { userId },
  })
}

export async function findAssistantById(id: string) {
  return prisma.assistant.findUnique({
    where: { id },
  })
}

export async function findSystemDefaultAssistant() {
  return prisma.assistant.findFirst({
    where: { isSystemDefault: true },
  })
}

export async function findFallbackBuiltInAssistant() {
  return prisma.assistant.findFirst({
    where: { isBuiltIn: true },
    orderBy: { createdAt: "asc" },
  })
}

