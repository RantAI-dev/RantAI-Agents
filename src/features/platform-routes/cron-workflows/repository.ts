import { prisma } from "@/lib/prisma"

export async function deleteExpiredUserMemories(now: Date) {
  return prisma.userMemory.deleteMany({
    where: {
      expiresAt: { not: null, lt: now },
    },
  })
}

export async function findActiveWorkflows() {
  return prisma.workflow.findMany({
    where: { status: "ACTIVE" },
  })
}
