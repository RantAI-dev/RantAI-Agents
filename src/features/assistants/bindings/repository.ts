import { prisma } from "@/lib/prisma"

export async function findAssistantById(id: string) {
  return prisma.assistant.findUnique({ where: { id } })
}

export async function findAssistantToolBindings(assistantId: string) {
  return prisma.assistantTool.findMany({
    where: { assistantId },
    include: {
      tool: {
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          category: true,
          icon: true,
          isBuiltIn: true,
          enabled: true,
          userSelectable: true,
        },
      },
    },
  })
}

export async function findHiddenAssistantToolIds(assistantId: string) {
  const rows = await prisma.assistantTool.findMany({
    where: {
      assistantId,
      tool: { userSelectable: false },
    },
    select: { toolId: true },
  })
  return rows.map((row) => row.toolId)
}

export async function replaceAssistantToolBindings(
  assistantId: string,
  toolIds: string[]
) {
  await prisma.$transaction([
    prisma.assistantTool.deleteMany({ where: { assistantId } }),
    ...(toolIds.length > 0
      ? [
          prisma.assistantTool.createMany({
            data: toolIds.map((toolId) => ({ assistantId, toolId })),
          }),
        ]
      : []),
  ])
}

export async function findAssistantSkillBindings(assistantId: string) {
  return prisma.assistantSkill.findMany({
    where: { assistantId, enabled: true },
    include: {
      skill: {
        select: { displayName: true, description: true, icon: true },
      },
    },
    orderBy: { priority: "asc" },
  })
}

export async function replaceAssistantSkillBindings(
  assistantId: string,
  skillIds: string[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.assistantSkill.deleteMany({ where: { assistantId } })
    if (skillIds.length > 0) {
      await tx.assistantSkill.createMany({
        data: skillIds.map((skillId, index) => ({
          assistantId,
          skillId,
          priority: index,
        })),
      })
    }
  })
}

export async function findAssistantMcpServerBindings(assistantId: string) {
  return prisma.assistantMcpServer.findMany({
    where: { assistantId },
    include: {
      mcpServer: {
        select: {
          id: true,
          name: true,
          description: true,
          transport: true,
          enabled: true,
          lastConnectedAt: true,
          lastError: true,
          _count: { select: { tools: true } },
        },
      },
    },
  })
}

export async function replaceAssistantMcpServerBindings(
  assistantId: string,
  mcpServerIds: string[]
) {
  await prisma.$transaction([
    prisma.assistantMcpServer.deleteMany({ where: { assistantId } }),
    ...(mcpServerIds.length > 0
      ? [
          prisma.assistantMcpServer.createMany({
            data: mcpServerIds.map((mcpServerId) => ({ assistantId, mcpServerId })),
          }),
        ]
      : []),
  ])
}

export async function findAssistantWorkflowBindings(assistantId: string) {
  return prisma.assistantWorkflow.findMany({
    where: { assistantId },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          mode: true,
          category: true,
          trigger: true,
          tags: true,
          nodes: true,
          _count: { select: { runs: true } },
        },
      },
    },
  })
}

export async function replaceAssistantWorkflowBindings(
  assistantId: string,
  workflowIds: string[]
) {
  await prisma.$transaction([
    prisma.assistantWorkflow.deleteMany({ where: { assistantId } }),
    ...(workflowIds.length > 0
      ? [
          prisma.assistantWorkflow.createMany({
            data: workflowIds.map((workflowId) => ({ assistantId, workflowId })),
          }),
        ]
      : []),
  ])
}
