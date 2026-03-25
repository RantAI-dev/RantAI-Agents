import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findEmployeeForChat(
  employeeId: string,
  organizationId: string | null
) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: employeeId,
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      id: true,
      groupId: true,
    },
  })
}

export async function findEmployeeGroupById(groupId: string) {
  return prisma.employeeGroup.findUnique({
    where: { id: groupId },
    select: {
      containerPort: true,
      gatewayToken: true,
      containerId: true,
      status: true,
    },
  })
}

export async function findChatMessagesByEmployeeId(employeeId: string) {
  return prisma.employeeChatMessage.findMany({
    where: { digitalEmployeeId: employeeId },
    orderBy: { createdAt: "asc" },
  })
}

export async function findRecentChatMessagesByEmployeeId(
  employeeId: string,
  take = 21
) {
  return prisma.employeeChatMessage.findMany({
    where: { digitalEmployeeId: employeeId },
    orderBy: { createdAt: "desc" },
    take,
  })
}

export async function createChatMessage(
  data: Prisma.EmployeeChatMessageUncheckedCreateInput
) {
  return prisma.employeeChatMessage.create({
    data,
  })
}

export async function createEmployeeRun(
  data: Prisma.EmployeeRunUncheckedCreateInput
) {
  return prisma.employeeRun.create({
    data,
  })
}

export async function updateEmployeeRun(
  runId: string,
  data: Prisma.EmployeeRunUpdateInput
) {
  return prisma.employeeRun.update({
    where: { id: runId },
    data,
  })
}
