import type { GenerateAssistantPromptBodyInput } from "./schema"
import { generateAssistantPromptText } from "./repository"

export interface GeneratedAssistantPrompt {
  systemPrompt: string
  suggestedName: string
  suggestedEmoji: string
}

/**
 * Generates and parses structured prompt output for assistant creation.
 */
export async function generateAssistantPrompt(
  input: GenerateAssistantPromptBodyInput
): Promise<GeneratedAssistantPrompt> {
  const text = await generateAssistantPromptText(input.description)

  const nameMatch = text.match(/^NAME:\s*(.+)$/m)
  const emojiMatch = text.match(/^EMOJI:\s*(.+)$/m)
  const promptMatch = text.match(/PROMPT:\s*\n([\s\S]+)$/)

  return {
    systemPrompt: promptMatch?.[1]?.trim() || text.trim(),
    suggestedName: nameMatch?.[1]?.trim() || "",
    suggestedEmoji: emojiMatch?.[1]?.trim() || "🤖",
  }
}
