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

export async function findDashboardSkillById(
  id: string,
  organizationId: string | null
) {
  // Mirrors findDashboardSkillsByOrganization: global (null-org) skills are
  // readable by everyone; org-owned skills only by the owning org.
  return prisma.skill.findFirst({
    where: {
      id,
      OR: [
        { organizationId: null },
        ...(organizationId ? [{ organizationId }] : []),
      ],
    },
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
  organizationId: string | null,
  data: Prisma.SkillUpdateInput
) {
  // Writes are scoped strictly to the caller's org — global (null-org)
  // platform skills are not user-editable.
  const result = await prisma.skill.updateMany({
    where: { id, organizationId },
    data,
  })
  if (result.count === 0) {
    return null
  }
  return prisma.skill.findUnique({ where: { id } })
}

export async function deleteDashboardSkill(
  id: string,
  organizationId: string | null
) {
  return prisma.skill.deleteMany({ where: { id, organizationId } })
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
