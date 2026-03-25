import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findDigitalEmployeeTrustContextById(params: {
  digitalEmployeeId: string
  organizationId: string | null
}) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: params.digitalEmployeeId,
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      autonomyLevel: true,
    },
  })
}

export async function findDigitalEmployeeTrustEventsById(digitalEmployeeId: string) {
  return prisma.employeeTrustEvent.findMany({
    where: { digitalEmployeeId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
}

export async function updateDigitalEmployeeAutonomyLevelById(
  digitalEmployeeId: string,
  autonomyLevel: string
) {
  return prisma.digitalEmployee.update({
    where: { id: digitalEmployeeId },
    data: { autonomyLevel },
  })
}

export async function createDigitalEmployeeTrustEvent(
  data: Prisma.EmployeeTrustEventUncheckedCreateInput
) {
  return prisma.employeeTrustEvent.create({ data })
}

export async function createDigitalEmployeeAuditLog(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data })
}
