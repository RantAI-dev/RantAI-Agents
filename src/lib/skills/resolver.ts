import { prisma } from "@/lib/prisma"

/**
 * Resolve all enabled skills for an assistant and concatenate their content
 * into a single prompt section to append to the system prompt.
 */
export async function resolveSkillsForAssistant(
  assistantId: string,
  skillIds?: string[],
  userId?: string
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
          ...(userId
            ? [
                {
                  organization: {
                    memberships: {
                      some: {
                        userId,
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      },
    })

    if (skills.length === 0) return null

    const orderedSkills = skillIds
      .map((id) => skills.find((skill) => skill.id === id))
      .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))

    const resolvedIds = new Set(orderedSkills.map((skill) => skill.id))
    const missingSkillIds = skillIds.filter((id) => !resolvedIds.has(id))
    if (missingSkillIds.length > 0) {
      console.warn(
        `[Skills] Missing selected skills for assistant ${assistantId}: ${missingSkillIds.join(", ")}`
      )
    }

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

/**
 * Resolve required tool names from selected skills.
 * Supports metadata formats used by both local and marketplace-installed skills.
 */
export async function resolveRequiredToolNamesForSkills(
  skillIds: string[],
  organizationId?: string | null,
  userId?: string
): Promise<string[]> {
  if (!Array.isArray(skillIds) || skillIds.length === 0) {
    return []
  }

  const skills = await prisma.skill.findMany({
    where: {
      id: { in: skillIds },
      enabled: true,
      OR: [
        { organizationId: null },
        ...(organizationId ? [{ organizationId }] : []),
        ...(userId
          ? [
              {
                organization: {
                  memberships: {
                    some: {
                      userId,
                    },
                  },
                },
              },
            ]
          : []),
      ],
    },
    select: {
      metadata: true,
    },
  })

  const toolIdSet = new Set<string>()
  const toolNameSet = new Set<string>()
  const addToolName = (value: unknown) => {
    if (typeof value === "string" && value.length > 0) {
      toolNameSet.add(value)
    }
  }

  for (const skill of skills) {
    const metadata =
      skill.metadata && typeof skill.metadata === "object" && !Array.isArray(skill.metadata)
        ? (skill.metadata as Record<string, unknown>)
        : null
    if (!metadata) continue

    const toolIds = Array.isArray(metadata.toolIds) ? metadata.toolIds : []
    for (const toolId of toolIds) {
      if (typeof toolId === "string" && toolId.length > 0) {
        toolIdSet.add(toolId)
      }
    }

    const sharedTools = Array.isArray(metadata.sharedTools) ? metadata.sharedTools : []
    for (const tool of sharedTools) addToolName(tool)

    const directTools = Array.isArray(metadata.tools) ? metadata.tools : []
    for (const tool of directTools) addToolName(tool)

    const requirements =
      metadata.requirements &&
      typeof metadata.requirements === "object" &&
      !Array.isArray(metadata.requirements)
        ? (metadata.requirements as Record<string, unknown>)
        : null
    const requiredTools = Array.isArray(requirements?.tools) ? requirements.tools : []
    for (const tool of requiredTools) {
      if (typeof tool === "object" && tool !== null && !Array.isArray(tool)) {
        const candidate = tool as Record<string, unknown>
        addToolName(candidate.name)
        addToolName(candidate.toolName)
        addToolName(candidate.id)
      } else {
        addToolName(tool)
      }
    }
  }

  if (toolIdSet.size > 0) {
    const toolsById = await prisma.tool.findMany({
      where: {
        id: { in: Array.from(toolIdSet) },
        enabled: true,
      },
      select: {
        name: true,
      },
    })
    for (const tool of toolsById) {
      if (tool.name) toolNameSet.add(tool.name)
    }
  }

  return Array.from(toolNameSet)
}
