export interface VariableContext {
  userName?: string
  assistantName?: string
  language?: string
}

type VariableResolver = (ctx: VariableContext) => string

const BUILT_IN_VARIABLES: Record<string, VariableResolver> = {
  user_name: (ctx) => ctx.userName || "User",
  date: () => new Date().toLocaleDateString(),
  time: () => new Date().toLocaleTimeString(),
  datetime: () => new Date().toLocaleString(),
  assistant_name: (ctx) => ctx.assistantName || "Assistant",
  language: (ctx) => ctx.language || "English",
}

/**
 * List of available variable names for the UI chips.
 */
export const AVAILABLE_VARIABLES = Object.keys(BUILT_IN_VARIABLES)

/**
 * Short description for each variable shown in tooltips.
 */
export const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  user_name: "The current user's display name",
  date: "Today's date (localized)",
  time: "Current time (localized)",
  datetime: "Current date and time",
  assistant_name: "This agent's name",
  language: "User's preferred language",
}

/**
 * Replace {{variable_name}} placeholders in a prompt string with resolved values.
 */
export function resolvePromptVariables(
  prompt: string,
  context: VariableContext
): string {
  return prompt.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
    const resolver = BUILT_IN_VARIABLES[varName]
    if (!resolver) return match // leave unknown variables as-is
    return resolver(context)
  })
}
