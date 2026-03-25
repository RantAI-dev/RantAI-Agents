import { prisma } from "@/lib/prisma"

export async function findExpiredApprovals(now: Date) {
  return prisma.employeeApproval.findMany({
    where: {
      status: { in: ["PENDING", "DELIVERED"] },
      expiresAt: { lt: now },
    },
  })
}

export async function markApprovalExpired(approvalId: string, now: Date) {
  return prisma.employeeApproval.update({
    where: { id: approvalId },
    data: {
      status: "EXPIRED",
      respondedAt: now,
    },
  })
}

export async function findRunById(runId: string) {
  return prisma.employeeRun.findUnique({
    where: { id: runId },
  })
}

export async function markRunFailed(runId: string, error: string, now: Date) {
  return prisma.employeeRun.update({
    where: { id: runId },
    data: { status: "FAILED", error, completedAt: now },
  })
}
