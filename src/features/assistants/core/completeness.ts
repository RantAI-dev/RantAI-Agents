import type { TabId } from "@/features/assistants/components/builder/agent-editor-layout"

export type TabStatus = "required-missing" | "filled" | "empty"

export interface CompletenessFormState {
  name: string
  description: string
  systemPrompt: string
  model: string
  openingMessage: string
  openingQuestions: string[]
  liveChatEnabled: boolean
  selectedToolIds: string[]
  selectedSkillIds: string[]
  selectedMcpServerIds: string[]
  selectedWorkflowIds: string[]
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  memoryConfig: Record<string, unknown>
  modelConfig: Record<string, unknown>
  chatConfig: Record<string, unknown>
  guardRails: Record<string, unknown>
  availableModelIds: string[]
}

export function isNameValid(name: string): boolean {
  return name.trim().length > 0
}

export function isSystemPromptValid(prompt: string): boolean {
  return prompt.trim().length >= 20
}

export function isModelValid(model: string, availableIds: string[]): boolean {
  return availableIds.includes(model)
}

function hasAnyContent(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length > 0
}

export function computeTabStatus(
  form: CompletenessFormState,
  tab: TabId
): TabStatus {
  switch (tab) {
    case "configure": {
      const nameOk = isNameValid(form.name)
      const promptOk = isSystemPromptValid(form.systemPrompt)
      if (!nameOk || !promptOk) return "required-missing"
      return "filled"
    }
    case "model": {
      if (!isModelValid(form.model, form.availableModelIds)) {
        return "required-missing"
      }
      return "filled"
    }
    case "tools":
      return form.selectedToolIds.length > 0 ? "filled" : "empty"
    case "skills":
      return form.selectedSkillIds.length > 0 ? "filled" : "empty"
    case "workflows":
      return form.selectedWorkflowIds.length > 0 ? "filled" : "empty"
    case "mcp":
      return form.selectedMcpServerIds.length > 0 ? "filled" : "empty"
    case "knowledge":
      return form.useKnowledgeBase && form.knowledgeBaseGroupIds.length > 0
        ? "filled"
        : "empty"
    case "memory":
      return hasAnyContent(form.memoryConfig) ? "filled" : "empty"
    case "guardrails":
      return hasAnyContent(form.guardRails) ? "filled" : "empty"
    case "chat":
      return hasAnyContent(form.chatConfig) ? "filled" : "empty"
    case "test":
    case "deploy":
      return "empty"
  }
}

export interface DeployReadiness {
  ok: boolean
  missing: Array<"name" | "systemPrompt" | "model" | "openingMessage">
}

export function isDeployReady(form: CompletenessFormState): DeployReadiness {
  const missing: DeployReadiness["missing"] = []
  if (!isNameValid(form.name)) missing.push("name")
  if (!isSystemPromptValid(form.systemPrompt)) missing.push("systemPrompt")
  if (!isModelValid(form.model, form.availableModelIds)) missing.push("model")
  if (form.liveChatEnabled && form.openingMessage.trim().length === 0) {
    missing.push("openingMessage")
  }
  return { ok: missing.length === 0, missing }
}
