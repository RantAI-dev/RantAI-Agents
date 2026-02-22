import { prisma } from "@/lib/prisma"

/**
 * Resolve all enabled skills for an assistant and concatenate their content
 * into a single prompt section to append to the system prompt.
 */
export async function resolveSkillsForAssistant(
  assistantId: string
): Promise<string | null> {
  const bindings = await prisma.assistantSkill.findMany({
    where: { assistantId, enabled: true },
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
