import { prisma } from "@/lib/prisma"
import { resolveBridge, type BridgeMapping } from "./bridge"
import type { SkillRequirements } from "./requirements"

export interface RequirementStatus {
  requirement: string
  category: "bin" | "env" | "tool" | "integration"
  status: "fulfilled" | "available" | "missing"
  bridge?: BridgeMapping
  fulfilledBy?: string
}

export interface SkillReadiness {
  level: "ready" | "partial" | "needs-setup"
  requirements: RequirementStatus[]
  fulfilledCount: number
  totalCount: number
}

/**
 * Given a skill's stored requirements + an assistant's enabled tools,
 * determine fulfillment status for each requirement.
 */
export async function resolveSkillReadiness(
  skillId: string,
  assistantId: string,
  organizationId?: string | null
): Promise<SkillReadiness> {
  // 1. Load skill and its stored requirements from metadata
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { metadata: true },
  })

  const metadata = (skill?.metadata ?? {}) as Record<string, unknown>
  const reqs = metadata.requirements as SkillRequirements | undefined

  if (!reqs) {
    return { level: "ready", requirements: [], fulfilledCount: 0, totalCount: 0 }
  }

  // 2. Load assistant's enabled tools
  const assistantTools = await prisma.assistantTool.findMany({
    where: { assistantId, enabled: true },
    include: { tool: { select: { id: true, name: true, category: true } } },
  })

  const enabledToolNames = new Set(assistantTools.map((at) => at.tool.name))

  // 3. Load all org tools (to check "available" status)
  const orgTools = await prisma.tool.findMany({
    where: {
      enabled: true,
      OR: [
        { organizationId: organizationId ?? undefined },
        { organizationId: null, isBuiltIn: true },
      ],
    },
    select: { id: true, name: true },
  })

  const orgToolNames = new Set(orgTools.map((t) => t.name))

  // 4. Resolve each requirement
  const statuses: RequirementStatus[] = []

  const checkRequirement = (
    req: string,
    category: RequirementStatus["category"]
  ) => {
    const bridge = resolveBridge(req)
    const status: RequirementStatus = {
      requirement: req,
      category,
      status: "missing",
      bridge: bridge ?? undefined,
    }

    if (bridge?.type === "builtin" && bridge.toolName) {
      if (enabledToolNames.has(bridge.toolName)) {
        status.status = "fulfilled"
        status.fulfilledBy = bridge.toolName
      } else if (orgToolNames.has(bridge.toolName)) {
        status.status = "available"
      }
    } else if (bridge?.type === "marketplace" && bridge.catalogItemId) {
      // Check if any org tool matches the marketplace item
      // Marketplace tools would have been installed with a matching name
      const installed = orgTools.find(
        (t) => t.name === req || t.name === bridge.catalogItemId
      )
      if (installed) {
        if (enabledToolNames.has(installed.name)) {
          status.status = "fulfilled"
          status.fulfilledBy = installed.name
        } else {
          status.status = "available"
        }
      }
    }

    // Direct tool name match (for tools requirement category)
    if (category === "tool") {
      if (enabledToolNames.has(req)) {
        status.status = "fulfilled"
        status.fulfilledBy = req
      } else if (orgToolNames.has(req)) {
        status.status = "available"
      }
    }

    statuses.push(status)
  }

  for (const bin of reqs.bins) checkRequirement(bin, "bin")
  for (const tool of reqs.tools) checkRequirement(tool, "tool")
  for (const integration of reqs.integrations) checkRequirement(integration, "integration")
  // Env vars are always "missing" since we can't check runtime env
  for (const envVar of reqs.env) {
    statuses.push({
      requirement: envVar,
      category: "env",
      status: "missing",
      bridge: undefined,
    })
  }

  const fulfilledCount = statuses.filter((s) => s.status === "fulfilled").length
  const totalCount = statuses.length

  let level: SkillReadiness["level"] = "ready"
  if (totalCount > 0) {
    if (fulfilledCount === totalCount) {
      level = "ready"
    } else if (fulfilledCount > 0) {
      level = "partial"
    } else {
      level = "needs-setup"
    }
  }

  return { level, requirements: statuses, fulfilledCount, totalCount }
}
