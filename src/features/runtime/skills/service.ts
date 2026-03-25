import { installClawHubSkill } from "@/lib/digital-employee/clawhub"
import { listClawHubSkills, searchClawHub } from "@/lib/digital-employee/clawhub"
import {
  createRuntimeAssistantSkillBinding,
  enableRuntimeAssistantSkill,
  findRuntimeAssistantSkillBinding,
  findRuntimeEmployeeSkillContext,
  findRuntimeEmployeeSkillInstallContext,
  findRuntimePlatformSkillById,
  findRuntimePlatformSkills,
} from "./repository"
import type { RuntimeSkillInstallInput, RuntimeSkillSearchQueryInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Searches platform and ClawHub skills using the same source filters as the runtime route.
 */
export async function searchRuntimeSkills(params: {
  employeeId: string
  query: RuntimeSkillSearchQueryInput
}): Promise<
  | {
      results: Array<{
        id?: string
        slug?: string
        name: string
        description: string
        source: "platform" | "clawhub"
        version?: string
        downloads?: number
        rating?: number
        enabled?: boolean
        content?: string
      }>
    }
  | ServiceError
> {
  const employee = await findRuntimeEmployeeSkillContext(params.employeeId)
  if (!employee) {
    return { status: 404, error: "Employee not found" }
  }

  const query = params.query.q || ""
  const source = params.query.source || ""
  const results: Array<{
    id?: string
    slug?: string
    name: string
    description: string
    source: "platform" | "clawhub"
    version?: string
    downloads?: number
    rating?: number
    enabled?: boolean
    content?: string
  }> = []

  if (!source || source === "platform") {
    const enabledSkillIds = new Set(
      (employee.assistant?.skills ?? []).map((skill) => skill.skillId)
    )
    const platformSkills = await findRuntimePlatformSkills({
      organizationId: employee.organizationId || null,
      query,
    })

    for (const skill of platformSkills) {
      results.push({
        id: skill.id,
        name: skill.displayName || skill.name,
        description: skill.description,
        source: "platform",
        version: skill.version || undefined,
        enabled: enabledSkillIds.has(skill.id),
        content: skill.content,
      })
    }
  }

  if (!source || source === "clawhub") {
    const clawHubResults = query.trim()
      ? await searchClawHub(query)
      : await listClawHubSkills()

    for (const skill of clawHubResults ?? []) {
      results.push({
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        source: "clawhub",
        version: skill.version,
        downloads: skill.downloads,
        rating: skill.rating,
      })
    }
  }

  return { results }
}

/**
 * Installs or re-enables a runtime skill for the current employee.
 */
export async function installRuntimeSkill(params: {
  employeeId: string
  input: RuntimeSkillInstallInput
}): Promise<
  | {
      success: true
      skill: Record<string, unknown>
    }
  | ServiceError
> {
  const source = params.input.source || "clawhub"

  if (source === "platform") {
    const skillId = params.input.skillId || params.input.id
    if (!isNonEmptyString(skillId)) {
      return { status: 400, error: "skillId is required for platform skills" }
    }

    const employee = await findRuntimeEmployeeSkillInstallContext(params.employeeId)
    if (!employee?.assistantId) {
      return { status: 404, error: "Employee has no assistant" }
    }

    const skill = await findRuntimePlatformSkillById({
      skillId,
      organizationId: employee.organizationId,
    })
    if (!skill) {
      return { status: 404, error: "Skill not found" }
    }

    const existing = await findRuntimeAssistantSkillBinding({
      assistantId: employee.assistantId,
      skillId,
    })
    if (existing) {
      if (!existing.enabled) {
        await enableRuntimeAssistantSkill(existing.id)
      }
    } else {
      await createRuntimeAssistantSkillBinding({
        assistantId: employee.assistantId,
        skillId,
        enabled: true,
      })
    }

    return {
      success: true,
      skill: {
        id: skill.id,
        name: skill.displayName || skill.name,
        description: skill.description,
        content: skill.content,
        source: "platform",
      },
    }
  }

  if (!isNonEmptyString(params.input.slug)) {
    return { status: 400, error: "slug is required" }
  }

  const skill = await installClawHubSkill(params.employeeId, params.input.slug, "agent-runtime")
  return {
    success: true,
    skill: {
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      content: skill.content,
      source: "clawhub",
    },
  }
}
