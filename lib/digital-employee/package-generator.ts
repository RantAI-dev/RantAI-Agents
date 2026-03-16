import { prisma } from "@/lib/prisma"
import type {
  EmployeePackage,
  EmployeeDeploymentConfig,
  AutonomyLevel,
  WorkspaceFileContext,
} from "./types"
import { WORKSPACE_FILES, DEFAULT_DEPLOYMENT_CONFIG } from "./types"
import { getClawHubSkill } from "./clawhub"
import { decryptCredential } from "@/lib/workflow/credentials"
import { getMcpServerConfig, MCP_INTEGRATION_IDS, isMcpIntegration } from "./mcp-mapping"
import { INTEGRATION_REGISTRY } from "./integrations"

export async function generateEmployeePackage(employeeId: string): Promise<EmployeePackage> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    include: {
      assistant: {
        include: {
          tools: { include: { tool: true }, where: { enabled: true } },
          skills: { include: { skill: true }, where: { enabled: true } },
          mcpServers: { include: { mcpServer: true }, where: { enabled: true } },
          assistantWorkflows: {
            include: { workflow: true },
            where: { enabled: true },
          },
        },
      },
      files: true,
      customTools: { where: { enabled: true, approved: true } },
      installedSkills: { where: { enabled: true } },
      memoryEntries: {
        where: { type: "daily_note" },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  })

  if (!employee || !employee.assistant) {
    throw new Error("Employee or assistant not found")
  }

  const assistant = employee.assistant
  const deploymentConfig = {
    ...DEFAULT_DEPLOYMENT_CONFIG,
    ...(employee.deploymentConfig as Partial<EmployeeDeploymentConfig>),
  }

  // Get long-term memory
  const longTermMemory = employee.files.find((f) => f.filename === "MEMORY.md")
  const memoryEntry = await prisma.employeeMemory.findFirst({
    where: { digitalEmployeeId: employeeId, type: "long_term" },
    orderBy: { updatedAt: "desc" },
  })

  // Fetch coworkers for TEAM.md
  const coworkers = await prisma.digitalEmployee.findMany({
    where: {
      organizationId: employee.organizationId,
      id: { not: employeeId },
      status: { in: ["ACTIVE", "PAUSED", "ONBOARDING"] },
    },
    select: { name: true, description: true, avatar: true, status: true },
  })

  // Fetch connected channel integrations (Telegram, WhatsApp, Discord, etc.)
  const CHANNEL_IDS = ["telegram", "whatsapp", "whatsapp-web", "discord"]
  const channelRows = await prisma.employeeIntegration.findMany({
    where: {
      digitalEmployeeId: employeeId,
      status: "connected",
      integrationId: { in: CHANNEL_IDS },
    },
  })
  const channelIntegrations: Array<{ channelId: string; credentials: Record<string, string> }> = []
  for (const ci of channelRows) {
    if (!ci.encryptedData) continue
    try {
      channelIntegrations.push({
        channelId: ci.integrationId,
        credentials: decryptCredential(ci.encryptedData) as Record<string, string>,
      })
    } catch (err) {
      console.error(`[PackageGenerator] Failed to decrypt ${ci.integrationId} credentials:`, err instanceof Error ? err.message : err)
    }
  }

  // Fetch MCP-type integrations
  const mcpRows = await prisma.employeeIntegration.findMany({
    where: {
      digitalEmployeeId: employeeId,
      integrationId: { in: [...MCP_INTEGRATION_IDS] },
      status: "connected",
    },
  })

  const mcpIntegrations = mcpRows
    .map((row) => {
      if (!row.encryptedData) return null
      try {
        const creds = decryptCredential(row.encryptedData) as Record<string, string>
        const config = getMcpServerConfig(row.integrationId, creds)
        if (!config) return null
        return { serverId: row.integrationId, ...config }
      } catch (err) {
        console.error(`[PackageGenerator] Failed to decrypt MCP ${row.integrationId} credentials:`, err instanceof Error ? err.message : err)
        return null
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Build connected integrations list for prompt context
  const allConnectedRows = await prisma.employeeIntegration.findMany({
    where: { digitalEmployeeId: employeeId, status: "connected" },
    select: { integrationId: true },
  })
  const connectedIntegrations = allConnectedRows
    .map((row) => {
      const def = INTEGRATION_REGISTRY.find((d) => d.id === row.integrationId)
      if (!def) return null
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        category: def.category,
        isMcp: isMcpIntegration(def.id),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  // Build workspace file context
  const ctx: WorkspaceFileContext = {
    employeeName: employee.name,
    employeeDescription: employee.description,
    avatar: employee.avatar,
    systemPrompt: assistant.systemPrompt,
    toolNames: [
      ...assistant.tools.map((t) => t.tool.displayName || t.tool.name),
      ...employee.customTools.map((t) => t.name),
    ],
    skillNames: assistant.skills.map((s) => s.skill.displayName || s.skill.name),
    workflowNames: assistant.assistantWorkflows.map((aw) => aw.workflow.name),
    schedules: deploymentConfig.schedules,
    coworkers,
    connectedIntegrations,
  }

  // Resolve workspace files: use DB files for user-editable ones,
  // but always regenerate read-only files (TOOLS.md) to reflect current tools/skills
  const workspaceFiles: Record<string, string> = {}
  const dbUpserts: Promise<unknown>[] = []
  for (const fileDef of WORKSPACE_FILES) {
    const dbFile = employee.files.find((f) => f.filename === fileDef.filename)
    if (dbFile && !fileDef.readOnly) {
      workspaceFiles[fileDef.filename] = dbFile.content
    } else {
      const content =
        typeof fileDef.defaultContent === "function"
          ? fileDef.defaultContent(ctx)
          : fileDef.defaultContent
      workspaceFiles[fileDef.filename] = content
      // Sync regenerated content back to DB so Files tab reflects current state
      if (fileDef.readOnly || !dbFile) {
        dbUpserts.push(
          prisma.employeeFile.upsert({
            where: {
              digitalEmployeeId_filename: {
                digitalEmployeeId: employeeId,
                filename: fileDef.filename,
              },
            },
            create: {
              digitalEmployeeId: employeeId,
              filename: fileDef.filename,
              content,
            },
            update: { content },
          })
        )
      }
    }
  }
  if (dbUpserts.length > 0) await Promise.all(dbUpserts)

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      description: employee.description,
      avatar: employee.avatar,
      autonomyLevel: employee.autonomyLevel as AutonomyLevel,
      sandboxMode: employee.sandboxMode,
    },
    agent: {
      systemPrompt: assistant.systemPrompt,
      model: assistant.model,
      modelConfig: assistant.modelConfig as Record<string, unknown> | null,
    },
    workspaceFiles,
    skills: {
      platform: assistant.skills.map((s) => ({
        name: s.skill.name,
        content: s.skill.content,
      })),
      clawhub: await Promise.all(
        employee.installedSkills.map(async (s) => {
          let content = s.content
          // Backfill empty content from ClawHub API (install may have failed to fetch)
          if (!content || content.trim().length === 0) {
            try {
              const fetched = await getClawHubSkill(s.slug)
              if (fetched?.content) {
                content = fetched.content
                // Persist so future deploys don't re-fetch
                await prisma.employeeInstalledSkill.update({
                  where: { id: s.id },
                  data: { content },
                })
              }
            } catch {
              // Non-critical — proceed with empty content
            }
          }
          return {
            slug: s.slug,
            name: s.name,
            description: s.description,
            content,
            metadata: s.metadata,
          }
        })
      ),
    },
    tools: {
      platform: assistant.tools.map((t) => ({
        name: t.tool.name,
        description: t.tool.description,
        parameters: t.tool.parameters,
      })),
      custom: employee.customTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        code: t.code,
        language: t.language,
      })),
    },
    workflows: assistant.assistantWorkflows.map((aw) => ({
      id: aw.workflow.id,
      name: aw.workflow.name,
      nodes: aw.workflow.nodes,
      edges: aw.workflow.edges,
      variables: aw.workflow.variables,
    })),
    mcpServers: assistant.mcpServers.map((m) => ({
      name: m.mcpServer.name,
      url: m.mcpServer.url,
      transport: m.mcpServer.transport,
    })),
    knowledgeBaseGroupIds: assistant.knowledgeBaseGroupIds,
    deploymentConfig,
    memory: {
      longTerm: longTermMemory?.content || memoryEntry?.content || "",
      recentDailyNotes: employee.memoryEntries.map((m) => ({
        date: m.date || m.createdAt.toISOString().split("T")[0],
        content: m.content,
      })),
    },
    channelIntegrations: channelIntegrations.length > 0 ? channelIntegrations : undefined,
    mcpIntegrations: mcpIntegrations.length > 0 ? mcpIntegrations : undefined,
  }
}
