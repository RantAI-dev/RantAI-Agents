import type { z } from "zod"
import type { ToolContext } from "@/lib/tools/types"

// ─── Community Tool ─────────────────────────────────────────

/**
 * A community tool definition — the atomic executable unit.
 * Lives in the community repo under tools/ or a skill's tools/ subdirectory.
 * Similar to ToolDefinition but with community-specific context.
 */
export interface CommunityToolDefinition {
  /** Machine name: "yahoo_finance_quote" */
  name: string
  /** Human name: "Yahoo Finance Quote" */
  displayName: string
  /** LLM-facing description */
  description: string
  /** Zod schema for tool input parameters */
  parameters: z.ZodSchema
  /** Tool execution function */
  execute: (
    params: Record<string, unknown>,
    ctx: CommunityToolContext
  ) => Promise<unknown>
  /** Optional tags for discovery */
  tags?: string[]
}

/**
 * Execution context passed to community tools.
 * Extends the base ToolContext with user-provided skill config.
 */
export interface CommunityToolContext extends ToolContext {
  /** User-provided config from InstalledSkill (API keys, Sheet ID, etc.) */
  config?: Record<string, unknown>
}

// ─── Community Skill ────────────────────────────────────────

/**
 * A community skill definition — a bundle of tools + AI prompt.
 * Lives in the community repo (skills/).
 */
export interface CommunitySkillDefinition {
  /** Machine name: "neko-finance" */
  name: string
  /** Human name: "Neko Finance" */
  displayName: string
  /** Marketplace description */
  description: string
  /** Semver: "1.0.0" */
  version: string
  /** Author name */
  author: string
  /** Marketplace category: "Finance", "Development", etc. */
  category: string
  /** Tags for discovery */
  tags: string[]
  /** Lucide icon name */
  icon?: string
  /** SKILL.md content — injected into system prompt when skill is active */
  skillPrompt: string
  /** Zod schema for user-configurable settings (rendered as form on install) */
  configSchema?: z.ZodSchema
  /** Skill-specific tools (defined in the skill's tools subdirectory) */
  tools: CommunityToolDefinition[]
  /** Names of shared tools from tools/ to bundle with this skill */
  sharedTools?: string[]
}

// ─── Registry ───────────────────────────────────────────────

/**
 * The shape exported by the community package (@rantai/community-skills).
 * Main app imports this at startup via the gateway.
 */
export interface CommunityRegistry {
  /** Standalone shared tools (from tools/) */
  tools: Record<string, CommunityToolDefinition>
  /** Skill bundles (from skills/) */
  skills: Record<string, CommunitySkillDefinition>
}
