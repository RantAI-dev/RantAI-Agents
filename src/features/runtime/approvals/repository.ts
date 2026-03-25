import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function createRuntimeApproval(data: {
  digitalEmployeeId: string
  employeeRunId: string
  workflowStepId: string | null
  requestType: string
  title: string
  description: string | null
  content: unknown
  options: unknown
  timeoutAction: string | null
  expiresAt: Date | null
}) {
  return prisma.employeeApproval.create({
    data: data as Prisma.EmployeeApprovalUncheckedCreateInput,
  })
}

export async function pauseRuntimeRun(runId: string) {
  return prisma.employeeRun.update({
    where: { id: runId },
    data: { status: "PAUSED" },
  })
}
