import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { resolveSkillReadiness } from "@/lib/skills/requirement-resolver"

export async function findDashboardSkillsByOrganization(
  organizationId: string | null
) {
  return prisma.skill.findMany({
    where: {
      OR: [
        { organizationId: null },
        ...(organizationId ? [{ organizationId }] : []),
      ],
    },
    include: {
      _count: { select: { assistantSkills: true } },
      installedSkill: { select: { icon: true } },
    },
    orderBy: [{ category: "asc" }, { displayName: "asc" }],
  })
}

export async function findDashboardSkillById(id: string) {
  return prisma.skill.findUnique({
    where: { id },
    include: { _count: { select: { assistantSkills: true } } },
  })
}

export async function findDashboardSkillByNameAndOrganization(
  name: string,
  organizationId: string | null
) {
  return prisma.skill.findFirst({
    where: { name, organizationId },
  })
}

export async function createDashboardSkill(
  data: Prisma.SkillUncheckedCreateInput
) {
  return prisma.skill.create({ data })
}

export async function updateDashboardSkill(
  id: string,
  data: Prisma.SkillUpdateInput
) {
  return prisma.skill.update({ where: { id }, data })
}

export async function deleteDashboardSkill(id: string) {
  return prisma.skill.delete({ where: { id } })
}

export async function resolveDashboardSkillReadiness(params: {
  skillId: string
  assistantId: string
  organizationId: string | null
}) {
  return resolveSkillReadiness(
    params.skillId,
    params.assistantId,
    params.organizationId
  )
}
