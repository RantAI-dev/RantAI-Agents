export interface AssistantToolInfo {
  name: string
  displayName: string
  description: string
  category: string
  icon?: string | null
}

export interface AssistantSkillInfo {
  id: string
  displayName: string
  description: string
  icon?: string | null
}

export interface KBGroup {
  id: string
  name: string
  color: string | null
  documentCount: number
}

export interface ChatToolbarHydrationData {
  assistantId: string
  availableTools: AssistantToolInfo[]
  availableSkills: AssistantSkillInfo[]
  assistantTools: AssistantToolInfo[]
  assistantSkills: AssistantSkillInfo[]
  kbGroups: KBGroup[]
}

export interface AssistantEditorToolItem {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  enabled: boolean
}

export interface AssistantEditorKnowledgeGroup {
  id: string
  name: string
  color: string | null
  documentCount: number
}

export interface AssistantEditorHydrationData {
  assistantId: string
  availableTools: AssistantEditorToolItem[]
  selectedToolIds: string[]
  knowledgeGroups: AssistantEditorKnowledgeGroup[]
}

export function readHydrationPayload<T>(scriptId: string): T | null {
  if (typeof document === "undefined") {
    return null
  }

  const script = document.getElementById(scriptId)
  if (!script?.textContent) {
    return null
  }

  try {
    return JSON.parse(script.textContent) as T
  } catch (error) {
    console.error(`[ChatHydration] Failed to parse ${scriptId}:`, error)
    return null
  }
}
