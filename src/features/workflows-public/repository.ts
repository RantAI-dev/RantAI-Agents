import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findWorkflowById(id: string) {
  return prisma.workflow.findUnique({
    where: { id },
  })
}

export async function findWorkflowRunById(runId: string) {
  return prisma.workflowRun.findUnique({
    where: { id: runId },
  })
}

export async function findActiveWorkflows() {
  return prisma.workflow.findMany({
    where: { status: "ACTIVE" },
  })
}

export async function findApiEnabledWorkflowByKey(apiKey: string) {
  return prisma.workflow.findFirst({
    where: { apiKey, apiEnabled: true },
    select: { id: true },
  })
}

export async function findDiscoverableWorkflows(where: Prisma.WorkflowWhereInput) {
  return prisma.workflow.findMany({
    where,
    select: {
      id: true,
      name: true,
      mode: true,
      description: true,
    },
    orderBy: { updatedAt: "desc" },
  })
}
