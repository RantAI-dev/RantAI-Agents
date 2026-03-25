import { prisma } from "@/lib/prisma"

export async function findDashboardAuditLogs(params: {
  where: Record<string, unknown>
  cursor?: string | null
  take: number
}) {
  return prisma.auditLog.findMany({
    where: params.where,
    orderBy: { createdAt: "desc" },
    take: params.take,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })
}
