import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findEmployeeForCustomTools(
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
      autonomyLevel: true,
    },
  })
}

export async function listCustomToolsByEmployeeId(employeeId: string) {
  return prisma.employeeCustomTool.findMany({
    where: { digitalEmployeeId: employeeId },
    orderBy: { createdAt: "desc" },
  })
}

export async function findCustomToolByEmployeeAndToolId(
  employeeId: string,
  toolId: string
) {
  return prisma.employeeCustomTool.findFirst({
    where: { id: toolId, digitalEmployeeId: employeeId },
  })
}

export async function createCustomTool(
  data: Prisma.EmployeeCustomToolUncheckedCreateInput
) {
  return prisma.employeeCustomTool.create({
    data,
  })
}

export async function updateCustomToolById(
  toolId: string,
  data: Prisma.EmployeeCustomToolUpdateInput
) {
  return prisma.employeeCustomTool.update({
    where: { id: toolId },
    data,
  })
}

export async function deleteCustomToolById(toolId: string) {
  return prisma.employeeCustomTool.delete({
    where: { id: toolId },
  })
}
