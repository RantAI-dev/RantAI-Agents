import { prisma } from "@/lib/prisma"

export async function findRuntimeEmployeeSkillContext(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: {
      organizationId: true,
      assistantId: true,
      assistant: {
        select: {
          skills: { select: { skillId: true, enabled: true } },
        },
      },
    },
  })
}

export async function findRuntimePlatformSkills(params: {
  organizationId: string | null
  query: string
}) {
  return prisma.skill.findMany({
    where: {
      organizationId: params.organizationId,
      enabled: true,
      ...(params.query.trim()
        ? {
            OR: [
              { name: { contains: params.query, mode: "insensitive" } },
              { displayName: { contains: params.query, mode: "insensitive" } },
              { description: { contains: params.query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { displayName: "asc" },
  })
}

export async function findRuntimeEmployeeSkillInstallContext(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { assistantId: true, organizationId: true },
  })
}

export async function findRuntimePlatformSkillById(params: {
  skillId: string
  organizationId: string | null
}) {
  return prisma.skill.findFirst({
    where: {
      id: params.skillId,
      organizationId: params.organizationId,
      enabled: true,
    },
  })
}

export async function findRuntimeAssistantSkillBinding(params: {
  assistantId: string
  skillId: string
}) {
  return prisma.assistantSkill.findFirst({
    where: {
      assistantId: params.assistantId,
      skillId: params.skillId,
    },
  })
}

export async function enableRuntimeAssistantSkill(bindingId: string) {
  return prisma.assistantSkill.update({
    where: { id: bindingId },
    data: { enabled: true },
  })
}

export async function createRuntimeAssistantSkillBinding(params: {
  assistantId: string
  skillId: string
  enabled: boolean
}) {
  return prisma.assistantSkill.create({
    data: params,
  })
}
