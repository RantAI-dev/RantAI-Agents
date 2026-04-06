import type { ParsedSkill } from "./parser"

export interface SkillRequirements {
  bins: string[]
  env: string[]
  tools: string[]
  integrations: string[]
  layer: "behavior" | "knowledge" | "execution"
}

/** Well-known CLI binaries that skills may reference */
const KNOWN_BINS = new Set([
  "gog", "gh", "jira", "slack", "notion", "linear", "vercel",
  "aws", "gcloud", "az", "kubectl", "docker", "terraform",
  "curl", "wget", "ffmpeg", "pandoc", "imagemagick",
])

/** Well-known tool name references */
const KNOWN_TOOLS = new Set([
  "knowledge_search", "web_search", "document_analysis",
  "create_artifact", "customer_lookup", "channel_dispatch",
])

/** Well-known integration/service names */
const KNOWN_INTEGRATIONS = new Set([
  "google", "slack", "github", "discord", "zendesk", "notion",
  "jira", "linear", "stripe", "twilio", "sendgrid", "shopify",
  "hubspot", "salesforce", "airtable", "asana", "trello",
])

/**
 * Extract requirements from a parsed skill's frontmatter and content body.
 *
 * Source A: YAML frontmatter fields (requires.bins, requires.env, requires.tools, integrations)
 * Source B: Content heuristic scanning for CLI commands, tool names, env vars, integrations
 */
export function extractRequirements(parsed: ParsedSkill): SkillRequirements {
  const bins = new Set<string>()
  const env = new Set<string>()
  const tools = new Set<string>()
  const integrations = new Set<string>()

  // --- Source A: Structured frontmatter ---
  const meta = parsed.metadata
  const requires = meta.requires as Record<string, unknown> | undefined

  if (requires) {
    if (Array.isArray(requires.bins)) {
      requires.bins.forEach((b: unknown) => typeof b === "string" && bins.add(b))
    }
    if (Array.isArray(requires.env)) {
      requires.env.forEach((e: unknown) => typeof e === "string" && env.add(e))
    }
    if (Array.isArray(requires.tools)) {
      requires.tools.forEach((t: unknown) => typeof t === "string" && tools.add(t))
    }
  }

  if (Array.isArray(meta.integrations)) {
    meta.integrations.forEach((i: unknown) => typeof i === "string" && integrations.add(i))
  }

  // --- Source B: Content heuristics ---
  const content = parsed.content

  // Detect CLI binary usage in code blocks: `gog cal list`, `gh issue create`
  const codeBlockPattern = /`([a-z][a-z0-9_-]*)\s+[^`]+`/g
  let match: RegExpExecArray | null
  while ((match = codeBlockPattern.exec(content)) !== null) {
    const bin = match[1]
    if (KNOWN_BINS.has(bin)) {
      bins.add(bin)
    }
  }

  // Detect fenced code blocks with CLI commands
  const fencedPattern = /```(?:bash|sh|shell)?\n([\s\S]*?)```/g
  while ((match = fencedPattern.exec(content)) !== null) {
    const block = match[1]
    for (const line of block.split("\n")) {
      const trimmed = line.replace(/^\$?\s*/, "").trim()
      const firstWord = trimmed.split(/\s+/)[0]
      if (firstWord && KNOWN_BINS.has(firstWord)) {
        bins.add(firstWord)
      }
    }
  }

  // Detect tool name references: "Use the knowledge_search tool", "call knowledge_search"
  for (const toolName of KNOWN_TOOLS) {
    const toolPattern = new RegExp(`\\b${toolName}\\b`, "i")
    if (toolPattern.test(content)) {
      tools.add(toolName)
    }
  }

  // Detect environment variable references: $GOOGLE_TOKEN, ${SLACK_TOKEN}, GOOGLE_TOKEN env
  const envPattern = /\$\{?([A-Z][A-Z0-9_]{2,})\}?/g
  while ((match = envPattern.exec(content)) !== null) {
    env.add(match[1])
  }

  // Detect integration mentions: "Slack API", "Google Calendar", "GitHub integration"
  const contentLower = content.toLowerCase()
  for (const integration of KNOWN_INTEGRATIONS) {
    if (contentLower.includes(integration)) {
      integrations.add(integration)
    }
  }

  const result: SkillRequirements = {
    bins: [...bins],
    env: [...env],
    tools: [...tools],
    integrations: [...integrations],
    layer: "behavior",
  }

  // Classification
  if (result.bins.length > 0 || result.integrations.length > 0) {
    result.layer = "execution"
  } else if (result.tools.length > 0) {
    result.layer = "execution"
  } else if (hasDomainKnowledgePatterns(content)) {
    result.layer = "knowledge"
  }

  return result
}

/** Check if content contains domain knowledge patterns (templates, best practices, guidelines) */
function hasDomainKnowledgePatterns(content: string): boolean {
  const knowledgeIndicators = [
    /\b(best practices?|guidelines?|standards?|conventions?)\b/i,
    /\b(template|boilerplate|scaffold)\b/i,
    /\b(always|never|must|should)\s+(use|include|follow|apply)\b/i,
    /^#+\s*(rules|principles|patterns)/im,
  ]

  return knowledgeIndicators.some((p) => p.test(content))
}
