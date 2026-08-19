import type { CanvasMode, SkillMode, ToolMode } from "../chat-input-toolbar"

export const NEW_CHAT_DRAFT_STORAGE_KEY = "rantai:new-chat-draft:v2"

export interface NewChatDraft {
  input: string
  webSearchOverride: boolean | null
  codeInterpreterOverride: boolean | null
  selectedKBGroupIds: string[] | null
  toolMode: ToolMode
  selectedToolNames: string[]
  skillMode: SkillMode
  selectedSkillIds: string[]
  canvasMode: CanvasMode
  updatedAt: number
}

const isMode = (value: unknown): value is ToolMode | SkillMode =>
  value === "auto" || value === "off" || value === "select"

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

export function parseNewChatDraft(value: string | null): NewChatDraft | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (typeof parsed.input !== "string") return null

    return {
      input: parsed.input,
      webSearchOverride:
        typeof parsed.webSearchOverride === "boolean" ? parsed.webSearchOverride : null,
      codeInterpreterOverride:
        typeof parsed.codeInterpreterOverride === "boolean"
          ? parsed.codeInterpreterOverride
          : null,
      selectedKBGroupIds: Array.isArray(parsed.selectedKBGroupIds)
        ? stringArray(parsed.selectedKBGroupIds)
        : null,
      toolMode: isMode(parsed.toolMode) ? parsed.toolMode : "auto",
      selectedToolNames: stringArray(parsed.selectedToolNames),
      skillMode: isMode(parsed.skillMode) ? parsed.skillMode : "auto",
      selectedSkillIds: stringArray(parsed.selectedSkillIds),
      canvasMode:
        parsed.canvasMode === false || typeof parsed.canvasMode === "string"
          ? (parsed.canvasMode as CanvasMode)
          : false,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}
