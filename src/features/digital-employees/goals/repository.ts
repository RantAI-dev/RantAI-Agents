import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findDigitalEmployeeGoalsContextById(params: {
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
    },
  })
}

export async function findDigitalEmployeeGoalsById(digitalEmployeeId: string) {
  return prisma.employeeGoal.findMany({
    where: {
      digitalEmployeeId,
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function resetDigitalEmployeeGoalsById(goalIds: string[]) {
  return prisma.employeeGoal.updateMany({
    where: {
      id: { in: goalIds },
    },
    data: {
      currentValue: 0,
    },
  })
}

export async function createDigitalEmployeeGoal(
  data: Prisma.EmployeeGoalUncheckedCreateInput
) {
  return prisma.employeeGoal.create({ data })
}

export async function updateDigitalEmployeeGoalById(
  goalId: string,
  data: Prisma.EmployeeGoalUncheckedUpdateInput
) {
  return prisma.employeeGoal.update({
    where: { id: goalId },
    data,
  })
}

export async function deleteDigitalEmployeeGoalById(goalId: string) {
  return prisma.employeeGoal.delete({
    where: { id: goalId },
  })
}
