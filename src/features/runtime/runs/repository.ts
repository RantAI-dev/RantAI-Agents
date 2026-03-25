import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function updateRuntimeRun(runId: string, data: {
  status?: string
  error?: string
  executionTimeMs?: number
  promptTokens?: number
  completionTokens?: number
  completedAt?: Date
  output?: unknown
}) {
  return prisma.employeeRun.update({
    where: { id: runId },
    data: data as Prisma.EmployeeRunUpdateInput,
  })
}

export async function findRuntimeRun(runId: string) {
  return prisma.employeeRun.findUnique({
    where: { id: runId },
    select: { digitalEmployeeId: true },
  })
}

export async function updateRuntimeEmployeeStats(params: {
  employeeId: string
  status: "COMPLETED" | "FAILED"
  promptTokens?: number
  completionTokens?: number
}) {
  return prisma.digitalEmployee.update({
    where: { id: params.employeeId },
    data: {
      lastActiveAt: new Date(),
      ...(params.status === "COMPLETED" ? { successfulRuns: { increment: 1 } } : {}),
      ...(params.status === "FAILED" ? { failedRuns: { increment: 1 } } : {}),
      ...(params.promptTokens || params.completionTokens
        ? {
            totalTokensUsed: {
              increment: (params.promptTokens || 0) + (params.completionTokens || 0),
            },
          }
        : {}),
    },
  })
}
