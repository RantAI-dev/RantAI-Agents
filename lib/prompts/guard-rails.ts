import type { GuardRailsConfig } from "@/lib/types/assistant"

/**
 * Build a guard-rails prompt section from configuration.
 * Returns empty string if no guard rails are configured.
 */
export function buildGuardRailsPrompt(config?: GuardRailsConfig | null): string {
  if (!config) return ""

  const parts: string[] = []

  // Blocked topics
  if (config.blockedTopics && config.blockedTopics.length > 0) {
    parts.push(
      `- NEVER discuss, provide information about, or engage with the following topics: ${config.blockedTopics.join(", ")}`
    )
  }

  // Custom safety instructions
  if (config.safetyInstructions?.trim()) {
    parts.push(`- ${config.safetyInstructions.trim()}`)
  }

  // Max response length
  if (config.maxResponseLength && config.maxResponseLength > 0) {
    parts.push(
      `- Keep all responses under ${config.maxResponseLength} characters in length`
    )
  }

  // Require citations
  if (config.requireCitations) {
    parts.push(
      "- Always cite sources when making factual claims. If you cannot cite a source, clearly state that the information is based on your training data"
    )
  }

  if (parts.length === 0) return ""

  return `\n\nSAFETY RULES:\n${parts.join("\n")}`
}
