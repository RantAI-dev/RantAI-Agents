import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findRuntimeAuditEmployeeOrganization(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { organizationId: true },
  })
}

export async function createRuntimeAuditLogEntry(data: {
  organizationId: string
  employeeId?: string
  userId?: string
  action: string
  resource: string
  detail?: Record<string, unknown>
  ipAddress?: string
  riskLevel?: string
}) {
  return prisma.auditLog.create({
    data: {
      organizationId: data.organizationId,
      employeeId: data.employeeId || null,
      userId: data.userId || null,
      action: data.action,
      resource: data.resource,
      detail: (data.detail || {}) as Prisma.InputJsonValue,
      ipAddress: data.ipAddress || null,
      riskLevel: data.riskLevel || "low",
    },
  })
}
