import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findRuntimeEmployeeOrganization(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { organizationId: true },
  })
}

export async function listRuntimeEmployeesByOrganization(params: {
  employeeId: string
  organizationId: string
}) {
  return prisma.digitalEmployee.findMany({
    where: {
      organizationId: params.organizationId,
      id: { not: params.employeeId },
      status: { in: ["ACTIVE", "PAUSED", "ONBOARDING"] },
    },
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      status: true,
      autonomyLevel: true,
    },
    orderBy: { name: "asc" },
  })
}

export async function markRuntimeEmployeeActive(employeeId: string) {
  return prisma.digitalEmployee.updateMany({
    where: { id: employeeId },
    data: { lastActiveAt: new Date() },
  })
}

export async function findRuntimeEmployeeFile(employeeId: string, filename: string) {
  return prisma.employeeFile.findFirst({
    where: { digitalEmployeeId: employeeId, filename },
  })
}

export async function createRuntimeEmployeeFile(data: {
  digitalEmployeeId: string
  filename: string
  content: string
  updatedBy: string
}) {
  return prisma.employeeFile.create({
    data: data as Prisma.EmployeeFileUncheckedCreateInput,
  })
}

export async function updateRuntimeEmployeeFile(
  id: string,
  data: { content: string; updatedBy: string }
) {
  return prisma.employeeFile.update({
    where: { id },
    data,
  })
}

export async function findRuntimeEmployeeMemory(
  employeeId: string,
  type: string,
  date: string
) {
  return prisma.employeeMemory.findFirst({
    where: { digitalEmployeeId: employeeId, type, date },
  })
}

export async function createRuntimeEmployeeMemory(data: {
  digitalEmployeeId: string
  type: string
  date: string
  content: string
  embedding: number[]
}) {
  return prisma.employeeMemory.create({
    data: data as Prisma.EmployeeMemoryUncheckedCreateInput,
  })
}

export async function updateRuntimeEmployeeMemory(
  id: string,
  data: { content: string }
) {
  return prisma.employeeMemory.update({
    where: { id },
    data,
  })
}

export async function findRuntimeEmployeeDeploymentConfig(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { deploymentConfig: true },
  })
}

export async function updateRuntimeEmployeeDeploymentConfig(
  employeeId: string,
  deploymentConfig: Prisma.InputJsonValue
) {
  return prisma.digitalEmployee.update({
    where: { id: employeeId },
    data: { deploymentConfig },
  })
}
