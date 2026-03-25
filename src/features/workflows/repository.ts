import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findWorkflowsByScope(params: {
  organizationId: string | null
  assistantId: string | null
}) {
  return prisma.workflow.findMany({
    where: {
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      ...(params.assistantId ? { assistantId: params.assistantId } : {}),
    },
    include: {
      _count: { select: { runs: true } },
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function createWorkflowWithCount(data: Prisma.WorkflowUncheckedCreateInput) {
  return prisma.workflow.create({
    data,
    include: {
      _count: { select: { runs: true } },
    },
  })
}

export async function findWorkflowById(id: string) {
  return prisma.workflow.findUnique({
    where: { id },
    include: {
      _count: { select: { runs: true } },
    },
  })
}

export async function findWorkflowApiKeyById(id: string) {
  return prisma.workflow.findUnique({
    where: { id },
    select: { apiKey: true },
  })
}

export async function updateWorkflowById(id: string, data: Prisma.WorkflowUpdateInput) {
  return prisma.workflow.update({
    where: { id },
    data,
    include: {
      _count: { select: { runs: true } },
    },
  })
}

export async function deleteWorkflowById(id: string) {
  return prisma.workflow.delete({
    where: { id },
  })
}

export async function findWorkflowRunsByWorkflowId(workflowId: string, take = 50) {
  return prisma.workflowRun.findMany({
    where: { workflowId },
    orderBy: { startedAt: "desc" },
    take,
  })
}

export async function findWorkflowRunById(runId: string) {
  return prisma.workflowRun.findUnique({
    where: { id: runId },
  })
}

export async function createWorkflowRun(data: Prisma.WorkflowRunCreateInput) {
  return prisma.workflowRun.create({ data })
}

export async function updateWorkflowRunById(
  runId: string,
  data: Prisma.WorkflowRunUpdateInput
) {
  return prisma.workflowRun.update({
    where: { id: runId },
    data,
  })
}
