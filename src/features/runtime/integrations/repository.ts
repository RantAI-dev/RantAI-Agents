import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function createRuntimeIntegrationApproval(data: {
  digitalEmployeeId: string
  employeeRunId: string
  requestType: string
  title: string
  description: string
  content: object
  options: object
  channel: string
  expiresAt: Date
}) {
  return prisma.employeeApproval.create({
    data: data as Prisma.EmployeeApprovalUncheckedCreateInput,
  })
}

export async function upsertRuntimeEmployeeIntegration(data: {
  digitalEmployeeId: string
  integrationId: string
  status: string
  encryptedData?: string | null
  metadata?: Prisma.InputJsonValue
  connectedAt?: Date | null
  expiresAt?: Date | null
  lastError?: string | null
  lastTestedAt?: Date | null
}) {
  return prisma.employeeIntegration.upsert({
    where: {
      digitalEmployeeId_integrationId: {
        digitalEmployeeId: data.digitalEmployeeId,
        integrationId: data.integrationId,
      },
    },
    create: {
      digitalEmployeeId: data.digitalEmployeeId,
      integrationId: data.integrationId,
      status: data.status,
      encryptedData: data.encryptedData ?? undefined,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      connectedAt: data.connectedAt ?? undefined,
      expiresAt: data.expiresAt ?? undefined,
      lastError: data.lastError ?? undefined,
      lastTestedAt: data.lastTestedAt ?? undefined,
    },
    update: {
      status: data.status,
      encryptedData: data.encryptedData ?? undefined,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      connectedAt: data.connectedAt ?? undefined,
      expiresAt: data.expiresAt ?? undefined,
      lastError: data.lastError ?? undefined,
      lastTestedAt: data.lastTestedAt ?? undefined,
    },
  })
}

export async function findRuntimeEmployeeIntegration(params: {
  digitalEmployeeId: string
  integrationId: string
}) {
  return prisma.employeeIntegration.findUnique({
    where: {
      digitalEmployeeId_integrationId: {
        digitalEmployeeId: params.digitalEmployeeId,
        integrationId: params.integrationId,
      },
    },
  })
}

export async function updateRuntimeEmployeeIntegration(
  id: string,
  data: {
    status?: string
    lastTestedAt?: Date
    lastError?: string | null
  }
) {
  return prisma.employeeIntegration.update({
    where: { id },
    data,
  })
}
