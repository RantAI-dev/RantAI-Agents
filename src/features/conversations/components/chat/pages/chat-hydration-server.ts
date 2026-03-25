import "server-only"

import {
  listAssistantSkills,
  listAssistantTools,
  isServiceError,
} from "@/src/features/assistants/bindings/service"
import { listKnowledgeGroupsForDashboard, type KnowledgeGroupListItem } from "@/src/features/knowledge/groups/service"
import { listDashboardSkills } from "@/src/features/skills/service"
import { listToolsForDashboard } from "@/src/features/tools/service"
import type {
  AssistantEditorHydrationData,
  AssistantEditorKnowledgeGroup,
  AssistantEditorToolItem,
  AssistantSkillInfo,
  AssistantToolInfo,
  ChatToolbarHydrationData,
  KBGroup,
} from "./chat-hydration-types"

function mapKnowledgeGroups(groups: KnowledgeGroupListItem[]): KBGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    color: group.color,
    documentCount: group.documentCount,
  }))
}

function mapEditorKnowledgeGroups(groups: KnowledgeGroupListItem[]): AssistantEditorKnowledgeGroup[] {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    color: group.color,
    documentCount: group.documentCount,
  }))
}

function mapAssistantToolsToToolbar(tools: Array<Record<string, unknown>>): AssistantToolInfo[] {
  return tools
    .filter((tool) => tool.enabledForAssistant !== false)
    .map((tool) => ({
      name: String(tool.name || ""),
      displayName: String(tool.displayName || tool.name || ""),
      description: String(tool.description || ""),
      category: String(tool.category || "custom"),
      icon: typeof tool.icon === "string" || tool.icon === null ? (tool.icon as string | null) : null,
    }))
    .filter((tool) => tool.name.length > 0)
}

function filterAssistantToolsByAvailability(
  assistantTools: AssistantToolInfo[],
  availableTools: AssistantToolInfo[]
): AssistantToolInfo[] {
  const availableToolNames = new Set(availableTools.map((tool) => tool.name))
  return assistantTools.filter((tool) => availableToolNames.has(tool.name))
}

function mapAssistantSkillsToToolbar(skills: Array<Record<string, unknown>>): AssistantSkillInfo[] {
  return skills
    .map((skill) => ({
      id: String(skill.id || ""),
      displayName: String(skill.displayName || skill.name || ""),
      description: String(skill.description || ""),
      icon: typeof skill.icon === "string" || skill.icon === null ? (skill.icon as string | null) : null,
    }))
    .filter((skill) => skill.id.length > 0)
}

function extractSkillAutoToolNames(
  skill: Awaited<ReturnType<typeof listDashboardSkills>>[number],
  toolNameById: Map<string, string>
): string[] {
  const names = new Set<string>()
  const addToolName = (value: unknown) => {
    if (typeof value !== "string" || value.length === 0) return
    names.add(toolNameById.get(value) ?? value)
  }

  if (Array.isArray(skill.relatedToolIds)) {
    for (const toolId of skill.relatedToolIds) {
      const toolName = toolNameById.get(toolId)
      if (toolName) names.add(toolName)
    }
  }

  const metadata =
    skill.metadata && typeof skill.metadata === "object" && !Array.isArray(skill.metadata)
      ? (skill.metadata as Record<string, unknown>)
      : null
  const attachedToolIds = Array.isArray(metadata?.toolIds) ? metadata.toolIds : []
  for (const toolId of attachedToolIds) addToolName(toolId)

  const requirements =
    metadata?.requirements && typeof metadata.requirements === "object" && !Array.isArray(metadata.requirements)
      ? (metadata.requirements as Record<string, unknown>)
      : null
  const requiredTools = Array.isArray(requirements?.tools) ? requirements.tools : []
  for (const tool of requiredTools) {
    if (typeof tool === "object" && tool !== null && !Array.isArray(tool)) {
      const candidate = tool as Record<string, unknown>
      addToolName(candidate.name)
      addToolName(candidate.toolName)
      addToolName(candidate.id)
      continue
    }
    addToolName(tool)
  }

  const sharedTools = Array.isArray(metadata?.sharedTools) ? metadata.sharedTools : []
  for (const tool of sharedTools) addToolName(tool)

  const directTools = Array.isArray(metadata?.tools) ? metadata.tools : []
  for (const tool of directTools) addToolName(tool)

  return Array.from(names)
}

function mapDashboardToolsToToolbar(
  tools: Awaited<ReturnType<typeof listToolsForDashboard>>
): AssistantToolInfo[] {
  return tools
    .filter((tool) => tool.enabled !== false)
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      displayName: tool.displayName || tool.name,
      description: tool.description || "",
      category: tool.category || "custom",
      icon: tool.icon ?? null,
    }))
}

function mapDashboardSkillsToToolbar(
  skills: Awaited<ReturnType<typeof listDashboardSkills>>,
  toolNameById: Map<string, string>
): AssistantSkillInfo[] {
  return skills
    .filter((skill) => skill.enabled !== false)
    .map((skill) => ({
      id: skill.id,
      displayName: skill.displayName || skill.name || "",
      description: skill.description || "",
      icon: skill.icon ?? null,
      autoToolNames: extractSkillAutoToolNames(skill, toolNameById),
    }))
}

function mapEditorTools(
  tools: Awaited<ReturnType<typeof listToolsForDashboard>>
): AssistantEditorToolItem[] {
  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    displayName: tool.displayName,
    description: tool.description,
    category: tool.category,
    enabled: tool.enabled,
  }))
}

function selectedToolIdsFromBindings(tools: Array<Record<string, unknown>>): string[] {
  return tools
    .filter((tool) => tool.enabledForAssistant !== false)
    .map((tool) => String(tool.id || ""))
    .filter((id) => id.length > 0)
}

export async function loadChatToolbarHydrationData(params: {
  assistantId: string | null
  organizationId: string | null
  userId: string
}): Promise<ChatToolbarHydrationData | null> {
  if (!params.assistantId) {
    return null
  }

  const [toolsResult, skillsResult, groupsResult, availableTools, availableSkills] = await Promise.all([
    listAssistantTools(params.assistantId).catch(() => []),
    listAssistantSkills(params.assistantId).catch(() => []),
    listKnowledgeGroupsForDashboard(params.organizationId).catch(() => []),
    listToolsForDashboard(params.organizationId).catch(() => []),
    listDashboardSkills({
      organizationId: params.organizationId,
      userId: params.userId,
    }).catch(() => []),
  ])

  const assistantTools = isServiceError(toolsResult) ? [] : mapAssistantToolsToToolbar(toolsResult)
  const availableToolsMapped = mapDashboardToolsToToolbar(availableTools)
  const toolNameById = new Map(
    availableToolsMapped
      .filter((tool) => typeof tool.id === "string" && tool.id.length > 0)
      .map((tool) => [tool.id as string, tool.name])
  )
  const availableSkillsMapped = mapDashboardSkillsToToolbar(availableSkills, toolNameById)
  const availableSkillById = new Map(availableSkillsMapped.map((skill) => [skill.id, skill]))
  const assistantSkills = isServiceError(skillsResult) ? [] : mapAssistantSkillsToToolbar(skillsResult)

  return {
    assistantId: params.assistantId,
    availableTools: availableToolsMapped,
    availableSkills: availableSkillsMapped,
    assistantTools: filterAssistantToolsByAvailability(assistantTools, availableToolsMapped),
    assistantSkills: assistantSkills.map((skill) => ({
      ...skill,
      autoToolNames: availableSkillById.get(skill.id)?.autoToolNames ?? [],
    })),
    kbGroups: mapKnowledgeGroups(groupsResult),
  }
}

export async function loadAssistantEditorHydrationData(params: {
  assistantId: string | null
  organizationId: string | null
}): Promise<AssistantEditorHydrationData | null> {
  if (!params.assistantId) {
    return null
  }

  const [availableTools, knowledgeGroups, selectedToolsResult] = await Promise.all([
    listToolsForDashboard(params.organizationId).catch(() => []),
    listKnowledgeGroupsForDashboard(params.organizationId).catch(() => []),
    listAssistantTools(params.assistantId).catch(() => []),
  ])

  const selectedToolIds = isServiceError(selectedToolsResult)
    ? []
    : selectedToolIdsFromBindings(selectedToolsResult)

  return {
    assistantId: params.assistantId,
    availableTools: mapEditorTools(availableTools),
    selectedToolIds,
    knowledgeGroups: mapEditorKnowledgeGroups(knowledgeGroups),
  }
}
