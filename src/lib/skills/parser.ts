import matter from "gray-matter"
import { extractRequirements, type SkillRequirements } from "./requirements"

export interface ParsedSkill {
  name: string
  displayName: string
  description: string
  content: string // Markdown body (skill instructions)
  category: string
  tags: string[]
  version?: string
  author?: string
  sourceUrl?: string
  requirements?: SkillRequirements
  metadata: Record<string, unknown>
}

/**
 * Parse a SKILL.md file with YAML frontmatter + markdown body.
 * Frontmatter fields: name, displayName, description, category, tags, version, author
 */
export function parseSkillMarkdown(raw: string): ParsedSkill {
  const { data, content } = matter(raw)

  const name = typeof data.name === "string" ? data.name : slugify(data.displayName || "untitled")
  const displayName = typeof data.displayName === "string" ? data.displayName : name
  const description = typeof data.description === "string" ? data.description : ""
  const category = typeof data.category === "string" ? data.category : "general"
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : []
  const version = typeof data.version === "string" ? data.version : undefined
  const author = typeof data.author === "string" ? data.author : undefined

  const parsed: ParsedSkill = {
    name,
    displayName,
    description,
    content: content.trim(),
    category,
    tags,
    version,
    author,
    metadata: data,
  }

  // Extract requirements and store in metadata for persistence
  const requirements = extractRequirements(parsed)
  parsed.requirements = requirements
  parsed.metadata = { ...data, requirements }

  return parsed
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled"
}
