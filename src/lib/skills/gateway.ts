import type {
  CommunityRegistry,
  CommunityToolDefinition,
  CommunitySkillDefinition,
  CommunityToolContext,
} from "@/lib/skill-sdk"
import { communityToolToJsonSchema } from "@/lib/skill-sdk"

export interface ToolSchemaInfo {
  name: string
  displayName: string
  description: string
  parameters: object // JSON Schema
  tags?: string[]
}

let registry: CommunityRegistry | null = null

async function importCommunityPackage(): Promise<{
  tools?: Record<string, CommunityToolDefinition>
  skills?: Record<string, CommunitySkillDefinition>
}> {
  // Avoid static bundler resolution so build does not fail when the optional
  // community package is unavailable in a given environment.
  const dynamicImport = new Function("m", "return import(m)") as (
    moduleName: string
  ) => Promise<{
    tools?: Record<string, CommunityToolDefinition>
    skills?: Record<string, CommunitySkillDefinition>
  }>
  return dynamicImport("@rantai/community-skills")
}

/**
 * Initialize the gateway by loading the community package.
 * Called once at startup. Gracefully handles missing package.
 */
export async function initCommunityGateway(): Promise<void> {
  if (registry) return
  try {
    const pkg = await importCommunityPackage()
    registry = {
      tools: pkg.tools ?? {},
      skills: pkg.skills ?? {},
    }
    console.log(
      `[CommunityGateway] Loaded ${Object.keys(registry.tools).length} tools, ` +
        `${Object.keys(registry.skills).length} skills`
    )
  } catch {
    console.warn(
      "[CommunityGateway] @rantai/community-skills not installed, community features disabled"
    )
    registry = { tools: {}, skills: {} }
  }
}

/** Get the loaded registry (init if needed) */
export async function getCommunityRegistry(): Promise<CommunityRegistry> {
  if (!registry) await initCommunityGateway()
  return registry!
}

/** Get a standalone tool by name from tools/ */
export async function getCommunityTool(
  name: string
): Promise<CommunityToolDefinition | null> {
  const reg = await getCommunityRegistry()

  // Check standalone tools first
  if (reg.tools[name]) return reg.tools[name]

  // Then check skill-specific tools (skills may define tools with unique names)
  for (const skill of Object.values(reg.skills)) {
    const found = skill.tools.find((t) => t.name === name)
    if (found) return found
  }

  return null
}

/** Get a skill definition by name */
export async function getCommunitySkill(
  name: string
): Promise<CommunitySkillDefinition | null> {
  const reg = await getCommunityRegistry()
  return reg.skills[name] ?? null
}

/**
 * Get all tool JSON Schemas for a skill (shared + skill-specific).
 * Used during install to create Tool records in DB.
 */
export async function getToolSchemasForSkill(
  skillName: string
): Promise<ToolSchemaInfo[]> {
  const reg = await getCommunityRegistry()
  const skill = reg.skills[skillName]
  if (!skill) return []

  const schemas: ToolSchemaInfo[] = []

  // Skill-specific tools
  for (const tool of skill.tools) {
    schemas.push({
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      parameters: communityToolToJsonSchema(tool),
      tags: tool.tags,
    })
  }

  // Shared tools referenced by skill
  if (skill.sharedTools) {
    for (const toolName of skill.sharedTools) {
      const sharedTool = reg.tools[toolName]
      if (sharedTool) {
        schemas.push({
          name: sharedTool.name,
          displayName: sharedTool.displayName,
          description: sharedTool.description,
          parameters: communityToolToJsonSchema(sharedTool),
          tags: sharedTool.tags,
        })
      }
    }
  }

  return schemas
}

/**
 * Execute a community tool by name.
 * Looks up the tool in the registry and calls its execute function.
 */
export async function executeCommunityTool(
  toolName: string,
  params: Record<string, unknown>,
  ctx: CommunityToolContext
): Promise<unknown> {
  const tool = await getCommunityTool(toolName)
  if (!tool) {
    throw new Error(`Community tool "${toolName}" not found in registry`)
  }
  return tool.execute(params, ctx)
}
