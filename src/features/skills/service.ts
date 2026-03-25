import { parseSkillMarkdown } from "@/lib/skills/parser"
import { Prisma } from "@prisma/client"
import {
  createDashboardSkill as createDashboardSkillEntity,
  deleteDashboardSkill,
  findDashboardSkillById,
  findDashboardSkillByNameAndOrganization,
  findDashboardSkillsByOrganization,
  resolveDashboardSkillReadiness,
  updateDashboardSkill,
} from "./repository"
import type {
  CreateDashboardSkillInput,
  ImportDashboardSkillInput,
  UpdateDashboardSkillInput,
} from "./schema"

export interface ServiceError {
  status: number
  error: string
  existingId?: string
}

export interface DashboardSkillsContext {
  organizationId: string | null
  userId: string
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toListItem(skill: {
  id: string
  name: string
  displayName: string
  description: string
  content: string
  source: string
  sourceUrl: string | null
  version: string | null
  category: string
  tags: string[]
  icon: string | null
  metadata: Prisma.JsonValue | null
  enabled: boolean
  _count: { assistantSkills: number }
  installedSkill?: { icon: string | null } | null
  createdAt: Date
}) {
  const meta = isObjectRecord(skill.metadata) ? skill.metadata : {}
  const toolIds = Array.isArray(meta.toolIds) ? (meta.toolIds as string[]) : []

  return {
    id: skill.id,
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    content: skill.content,
    source: skill.source,
    sourceUrl: skill.sourceUrl,
    version: skill.version,
    category: skill.category,
    tags: skill.tags,
    icon: skill.icon || skill.installedSkill?.icon || null,
    metadata: skill.metadata,
    relatedToolIds: toolIds,
    enabled: skill.enabled,
    assistantCount: skill._count.assistantSkills,
    createdAt: skill.createdAt.toISOString(),
  }
}

/**
 * Lists skills visible to the current organization.
 */
export async function listDashboardSkills(
  context: DashboardSkillsContext
) {
  const skills = await findDashboardSkillsByOrganization(context.organizationId)
  return skills.map(toListItem)
}

/**
 * Creates a skill record in the current organization scope.
 */
export async function createDashboardSkillRecord(params: {
  context: DashboardSkillsContext
  input: CreateDashboardSkillInput
}): Promise<Record<string, unknown> | ServiceError> {
  const metadataInput =
    params.input.metadata === undefined
      ? undefined
      : params.input.metadata === null
        ? Prisma.DbNull
        : (params.input.metadata as Prisma.InputJsonValue)

  const skill = await createDashboardSkillEntity({
    name: params.input.name,
    displayName: params.input.displayName,
    description: params.input.description || "",
    content: params.input.content,
    source: params.input.source || "custom",
    sourceUrl: params.input.sourceUrl ?? null,
    version: params.input.version ?? null,
    category: params.input.category || "general",
    tags: params.input.tags || [],
    metadata: metadataInput,
    enabled: true,
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
  })

  return skill
}

/**
 * Loads one skill with its assistant binding count.
 */
export async function getDashboardSkillById(
  id: string
): Promise<Record<string, unknown> | ServiceError> {
  const skill = await findDashboardSkillById(id)
  if (!skill) {
    return { status: 404, error: "Skill not found" }
  }
  return skill
}

/**
 * Updates an existing skill record.
 */
export async function updateDashboardSkillRecord(params: {
  id: string
  input: UpdateDashboardSkillInput
}): Promise<Record<string, unknown> | ServiceError> {
  const skill = await updateDashboardSkill(params.id, {
    ...(params.input.displayName !== undefined && {
      displayName: params.input.displayName,
    }),
    ...(params.input.description !== undefined && {
      description: params.input.description,
    }),
    ...(params.input.content !== undefined && { content: params.input.content }),
    ...(params.input.category !== undefined && { category: params.input.category }),
    ...(params.input.tags !== undefined && { tags: params.input.tags }),
    ...(params.input.enabled !== undefined && { enabled: params.input.enabled }),
  })

  return skill
}

/**
 * Deletes a skill by id.
 */
export async function deleteDashboardSkillRecord(
  id: string
): Promise<{ success: true } | ServiceError> {
  await deleteDashboardSkill(id)
  return { success: true }
}

/**
 * Imports a skill from ClawHub or raw markdown content.
 */
export async function importDashboardSkillFromClawHub(params: {
  context: DashboardSkillsContext
  input: ImportDashboardSkillInput
}): Promise<Record<string, unknown> | ServiceError> {
  let markdown: string
  let sourceUrl: string | null = null

  if (params.input.rawContent) {
    markdown = params.input.rawContent
  } else if (params.input.slug) {
    sourceUrl = `https://clawhub.ai/skills/${params.input.slug}`

    const fileRes = await fetch(
      `https://clawhub.ai/api/v1/skills/${encodeURIComponent(params.input.slug)}/file?path=SKILL.md`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!fileRes.ok) {
      return {
        status: 400,
        error: `Failed to fetch SKILL.md from ClawHub: ${fileRes.status}`,
      }
    }

    markdown = await fileRes.text()
    try {
      const metaRes = await fetch(
        `https://clawhub.ai/api/v1/skills/${encodeURIComponent(params.input.slug)}`,
        { signal: AbortSignal.timeout(5_000) }
      )
      if (metaRes.ok) {
        const meta = await metaRes.json()
        const skill = meta.skill || meta
        if (skill.displayName && !markdown.includes("displayName:")) {
          markdown = markdown.replace(
            /^---\n/,
            `---\ndisplayName: "${skill.displayName}"\n`
          )
        }
        if (skill.summary && !markdown.includes("description:")) {
          markdown = markdown.replace(
            /^---\n/,
            `---\ndescription: "${String(skill.summary).substring(0, 200)}"\n`
          )
        }
      }
    } catch {
      // Metadata fetch is best-effort.
    }
  } else {
    return { status: 400, error: "Either slug or rawContent is required" }
  }

  const parsed = parseSkillMarkdown(markdown)
  const skillName = parsed.name || params.input.slug || "untitled"

  const existing = await findDashboardSkillByNameAndOrganization(
    skillName,
    params.context.organizationId
  )
  if (existing) {
    return {
      status: 409,
      error: `Skill "${skillName}" already exists`,
      existingId: existing.id,
    }
  }

  const skill = await createDashboardSkillEntity({
    name: skillName,
    displayName: parsed.displayName || skillName,
    description: parsed.description || "",
    content: parsed.content,
    source: "marketplace",
    sourceUrl,
    version: parsed.version,
    category: parsed.category,
    tags: parsed.tags,
    metadata: parsed.metadata as Prisma.InputJsonValue,
    enabled: true,
    organizationId: params.context.organizationId,
    createdBy: params.context.userId,
  })

  return skill
}

/**
 * Resolves whether a skill is ready for an assistant in org scope.
 */
export async function getDashboardSkillReadiness(params: {
  skillId: string
  assistantId: string
  organizationId: string | null
}) {
  return resolveDashboardSkillReadiness(params)
}
