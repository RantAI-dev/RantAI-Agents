import { prisma } from "@/lib/prisma"

/**
 * Resolve all enabled skills for an assistant and concatenate their content
 * into a single prompt section to append to the system prompt.
 */
export async function resolveSkillsForAssistant(
  assistantId: string,
  skillIds?: string[]
): Promise<string | null> {
  if (Array.isArray(skillIds) && skillIds.length > 0) {
    const assistant = await prisma.assistant.findUnique({
      where: { id: assistantId },
      select: { organizationId: true },
    })

    const skills = await prisma.skill.findMany({
      where: {
        id: { in: skillIds },
        enabled: true,
        OR: [
          { organizationId: null },
          ...(assistant?.organizationId
            ? [{ organizationId: assistant.organizationId }]
            : []),
        ],
      },
    })

    if (skills.length === 0) return null

    const orderedSkills = skillIds
      .map((id) => skills.find((skill) => skill.id === id))
      .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))

    const sections = orderedSkills.map(
      (skill) => `### Skill: ${skill.displayName}\n${skill.content}`
    )

    return `## Active Skills\n\n${sections.join("\n\n")}`
  }

  const bindings = await prisma.assistantSkill.findMany({
    where: {
      assistantId,
      enabled: true,
    },
    include: { skill: true },
    orderBy: { priority: "asc" },
  })

  const enabledSkills = bindings.filter((b) => b.skill.enabled)

  if (enabledSkills.length === 0) return null

  const sections = enabledSkills.map(
    (b) =>
      `### Skill: ${b.skill.displayName}\n${b.skill.content}`
  )

  return `## Active Skills\n\n${sections.join("\n\n")}`
}
