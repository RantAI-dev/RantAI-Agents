import { prisma } from "@/lib/prisma"

type DashboardMemoryType = "WORKING" | "SEMANTIC" | "LONG_TERM"

export async function findMemoriesByUser(userId: string, type?: string | null) {
  return prisma.userMemory.findMany({
    where: {
      userId,
      ...(type ? { type: type as DashboardMemoryType } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })
}

export async function countMemoriesByType(userId: string) {
  return prisma.userMemory.groupBy({
    by: ["type"],
    where: { userId },
    _count: true,
  })
}

export async function deleteMemoriesByType(userId: string, type: string) {
  return prisma.userMemory.deleteMany({
    where: { userId, type: type as DashboardMemoryType },
  })
}

export async function findMemoryById(id: string) {
  return prisma.userMemory.findUnique({
    where: { id },
    select: { userId: true },
  })
}

export async function deleteMemoryById(id: string) {
  return prisma.userMemory.delete({
    where: { id },
  })
}
