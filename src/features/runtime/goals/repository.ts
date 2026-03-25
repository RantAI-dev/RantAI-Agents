import { prisma } from "@/lib/prisma"

export async function findRuntimeGoalForEmployee(goalId: string, employeeId: string) {
  return prisma.employeeGoal.findFirst({
    where: {
      id: goalId,
      digitalEmployeeId: employeeId,
    },
  })
}

export async function updateRuntimeGoalCurrentValue(goalId: string, currentValue: number) {
  return prisma.employeeGoal.update({
    where: { id: goalId },
    data: { currentValue },
  })
}
