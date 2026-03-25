import { prisma } from "@/lib/prisma"

export async function findDigitalEmployeeRunContextById(params: {
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
      status: true,
      groupId: true,
    },
  })
}

export async function findDigitalEmployeeRunsById(params: {
  digitalEmployeeId: string
  limit: number
}) {
  return prisma.employeeRun.findMany({
    where: { digitalEmployeeId: params.digitalEmployeeId },
    orderBy: { startedAt: "desc" },
    take: params.limit,
  })
}

export async function findDigitalEmployeeRunById(params: {
  digitalEmployeeId: string
  runId: string
}) {
  return prisma.employeeRun.findFirst({
    where: {
      id: params.runId,
      digitalEmployeeId: params.digitalEmployeeId,
    },
  })
}

export async function findDigitalEmployeeGroupGatewayTokenById(groupId: string) {
  return prisma.employeeGroup.findUnique({
    where: { id: groupId },
    select: {
      gatewayToken: true,
    },
  })
}
