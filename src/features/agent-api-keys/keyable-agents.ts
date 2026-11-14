import type { Assistant } from "@/lib/types/assistant"

/** The agents a key may be minted for: the organisation's own. A built-in answers 404 (§3.6). */
export function keyableAgents(assistants: readonly Assistant[]): Assistant[] {
  return assistants.filter((assistant) => !assistant.isBuiltIn)
}
