import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findRuntimeInboxMessages(employeeId: string) {
  return prisma.employeeMessage.findMany({
    where: {
      toEmployeeId: employeeId,
      status: { in: ["pending", "delivered"] },
    },
    include: {
      fromEmployee: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function markRuntimeMessagesDelivered(messageIds: string[]) {
  if (messageIds.length === 0) return

  return prisma.employeeMessage.updateMany({
    where: { id: { in: messageIds } },
    data: { status: "delivered" },
  })
}

export async function findRuntimeEmployeeById(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      organizationId: true,
      autonomyLevel: true,
      supervisorId: true,
    },
  })
}

export async function findRuntimeEmployeeByIdAndOrganization(
  employeeId: string,
  organizationId: string
) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: employeeId,
      organizationId,
    },
    select: { id: true },
  })
}

export async function createRuntimeMessage(
  data: {
    organizationId: string
    fromEmployeeId: string
    toEmployeeId: string | null
    toGroup: string | null
    type: string
    subject: string
    content: string
    priority?: string
    attachments?: unknown
    status?: string
    metadata?: Record<string, unknown>
    parentMessageId?: string | null
    responseContent?: string | null
    responseData?: unknown
    respondedAt?: Date | null
  }
) {
  return prisma.employeeMessage.create({
    data: data as Prisma.EmployeeMessageUncheckedCreateInput,
  })
}

export async function createRuntimeApproval(data: {
  digitalEmployeeId: string
  employeeRunId: string
  requestType: string
  title: string
  description: string
  content: object
  options: object
}) {
  return prisma.employeeApproval.create({
    data: data as Prisma.EmployeeApprovalUncheckedCreateInput,
  })
}

export async function findRuntimeActiveRun(employeeId: string) {
  return prisma.employeeRun.findFirst({
    where: { digitalEmployeeId: employeeId, status: { in: ["RUNNING", "PAUSED"] } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  })
}

export async function findRuntimeMessageById(messageId: string) {
  return prisma.employeeMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      toEmployeeId: true,
      fromEmployeeId: true,
      organizationId: true,
      type: true,
      subject: true,
      status: true,
      responseContent: true,
      responseData: true,
      respondedAt: true,
    },
  })
}

export async function updateRuntimeMessage(
  messageId: string,
  data: Record<string, unknown> & Prisma.EmployeeMessageUpdateInput
) {
  return prisma.employeeMessage.update({
    where: { id: messageId },
    data,
  })
}
