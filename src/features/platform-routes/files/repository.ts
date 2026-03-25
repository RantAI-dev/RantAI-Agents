import { prisma } from "@/lib/prisma"

export async function findDashboardSessionOwner(sessionId: string) {
  return prisma.dashboardSession.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  })
}
