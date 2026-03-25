import {
  findAssistantById,
  findFallbackBuiltInAssistant,
  findSystemDefaultAssistant,
  findUserPreferenceByUserId,
} from "./repository"

export interface DefaultAssistantResult {
  assistant: Record<string, unknown> | null
  source: "user" | "system" | "fallback" | "none"
}

/**
 * Resolves effective default assistant with priority:
 * user preference -> system default -> first built-in.
 */
export async function resolveDefaultAssistant(
  userId?: string | null
): Promise<DefaultAssistantResult> {
  if (userId) {
    const preferences = await findUserPreferenceByUserId(userId)
    if (preferences?.defaultAssistantId) {
      const userDefault = await findAssistantById(preferences.defaultAssistantId)
      if (userDefault) {
        return { assistant: userDefault, source: "user" }
      }
    }
  }

  const systemDefault = await findSystemDefaultAssistant()
  if (systemDefault) {
    return { assistant: systemDefault, source: "system" }
  }

  const fallback = await findFallbackBuiltInAssistant()
  if (fallback) {
    return { assistant: fallback, source: "fallback" }
  }

  return { assistant: null, source: "none" }
}

