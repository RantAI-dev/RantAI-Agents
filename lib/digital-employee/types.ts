// ─── Digital Employee Types ────────────────────────────────────────

export type AutonomyLevel = "L1" | "L2" | "L3" | "L4" | "supervised" | "autonomous"

export interface EmployeeSchedule {
  id: string
  name: string
  cron: string
  workflowId?: string
  input?: Record<string, unknown>
  enabled: boolean
}

export interface HeartbeatConfig {
  enabled: boolean
  intervalMinutes: number
  activeHours?: { start: string; end: string } // "HH:mm" format
  checklist: string[]
}

export interface EmployeeDeploymentConfig {
  schedules: EmployeeSchedule[]
  heartbeat?: HeartbeatConfig
  timezone: string
  concurrency: number
  retryPolicy: {
    maxRetries: number
    backoffMs: number
  }
  permissions: {
    canInstallSkills: boolean
    canCreateTools: boolean
    canModifyMemory: boolean
    canAccessNetwork: boolean
  }
  env: Record<string, string>
}

export interface GatewayConfig {
  defaultChannel: string
  channels: string[]
  escalation: {
    enabled: boolean
    threshold: number
    target: string
  }
  timeout: number
}

export const DEFAULT_DEPLOYMENT_CONFIG: EmployeeDeploymentConfig = {
  schedules: [],
  heartbeat: {
    enabled: false,
    intervalMinutes: 30,
    checklist: [],
  },
  timezone: "UTC",
  concurrency: 1,
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 1000,
  },
  permissions: {
    canInstallSkills: false,
    canCreateTools: false,
    canModifyMemory: true,
    canAccessNetwork: true,
  },
  env: {},
}

// ─── OpenClaw-Compatible Workspace Files ───────────────────────────

export interface WorkspaceFileDefinition {
  filename: string
  purpose: string
  defaultContent: string | ((ctx: WorkspaceFileContext) => string)
  readOnly?: boolean
}

export interface ConnectedIntegration {
  id: string
  name: string
  description: string
  category: "communication" | "development" | "productivity" | "custom"
  /** Whether this integration provides MCP tools (vs being a channel) */
  isMcp: boolean
}

export interface WorkspaceFileContext {
  employeeName: string
  employeeDescription?: string | null
  avatar?: string | null
  systemPrompt: string
  supervisorName?: string
  supervisorEmail?: string
  toolNames: string[]
  skillNames: string[]
  workflowNames: string[]
  schedules: EmployeeSchedule[]
  coworkers?: Array<{ name: string; description?: string | null; avatar?: string | null; status: string }>
  /** All connected integrations (channels + MCP tool providers) */
  connectedIntegrations: ConnectedIntegration[]
}

export const WORKSPACE_FILES: WorkspaceFileDefinition[] = [
  {
    filename: "SOUL.md",
    purpose: "Behavioral philosophy, values, decision-making",
    defaultContent: (ctx) =>
      `# Soul\n\nYou are ${ctx.employeeName}${ctx.employeeDescription ? ` — ${ctx.employeeDescription}` : ""}.\n\n## Core Values\n- Be helpful and accurate\n- Ask for clarification when uncertain\n- Respect boundaries and permissions\n\n## Decision Framework\n- Prioritize safety and correctness\n- Escalate when unsure\n- Learn from feedback\n\n## Base Instructions\n${ctx.systemPrompt}\n`,
  },
  {
    filename: "IDENTITY.md",
    purpose: "External presentation (name, emoji, theme)",
    defaultContent: (ctx) =>
      `# Identity\n\n- **Name:** ${ctx.employeeName}\n- **Avatar:** ${ctx.avatar || "🤖"}\n- **Description:** ${ctx.employeeDescription || "A digital employee"}\n`,
  },
  {
    filename: "MEMORY.md",
    purpose: "Curated long-term facts and decisions",
    defaultContent: "# Memory\n\n_No memories yet. This file is updated as you learn._\n",
  },
  {
    filename: "USER.md",
    purpose: "Context about supervisor/user",
    defaultContent: (ctx) =>
      `# User Context\n\n- **Supervisor:** ${ctx.supervisorName || "Not assigned"}\n- **Email:** ${ctx.supervisorEmail || "N/A"}\n`,
  },
  {
    filename: "AGENTS.md",
    purpose: "Instructions and capabilities guide",
    readOnly: true,
    defaultContent: (ctx) => {
      const sections: string[] = ["# Agent Configuration\n"]

      // Capabilities overview
      sections.push("## Capabilities")
      sections.push(`- **Tools:** ${ctx.toolNames.length > 0 ? ctx.toolNames.join(", ") : "None"}`)
      sections.push(`- **Skills:** ${ctx.skillNames.length > 0 ? ctx.skillNames.join(", ") : "None"}`)
      sections.push(`- **Workflows:** ${ctx.workflowNames.length > 0 ? ctx.workflowNames.join(", ") : "None"}`)

      // Connected integrations
      const integrations = ctx.connectedIntegrations || []
      if (integrations.length > 0) {
        sections.push("")
        sections.push("## Connected Integrations")
        sections.push("")

        const channels = integrations.filter((i) => !i.isMcp)
        const mcpTools = integrations.filter((i) => i.isMcp)

        if (channels.length > 0) {
          sections.push("### Channels (messaging)")
          channels.forEach((ch) => sections.push(`- **${ch.name}** — ${ch.description}`))
          sections.push("")
        }

        if (mcpTools.length > 0) {
          sections.push("### Tool Integrations (MCP)")
          sections.push("These integrations provide you with additional tools. The tools are automatically available — use them when relevant to the user's request.")
          sections.push("")
          mcpTools.forEach((mcp) => sections.push(`- **${mcp.name}** — ${mcp.description}`))
          sections.push("")
        }
      }

      sections.push("")
      return sections.join("\n")
    },
  },
  {
    filename: "TOOLS.md",
    purpose: "Available capabilities and restrictions",
    readOnly: true,
    defaultContent: (ctx) => {
      const sections: string[] = ["# Tools\n"]

      // Platform tools (built-in + custom)
      if (ctx.toolNames.length > 0) {
        sections.push("## Platform Tools")
        sections.push(ctx.toolNames.map((t) => `- **${t}**`).join("\n"))
        sections.push("")
      }

      // MCP integration tools — tell the agent what's available
      const mcpIntegrations = (ctx.connectedIntegrations || []).filter((i) => i.isMcp)
      if (mcpIntegrations.length > 0) {
        sections.push("## Integration Tools (via MCP)")
        sections.push("The following integrations are connected and provide tools automatically.")
        sections.push("You can call these tools directly — they are registered in your tool registry.")
        sections.push("")
        for (const mcp of mcpIntegrations) {
          sections.push(`### ${mcp.name}`)
          sections.push(`${mcp.description}. Use ${mcp.name} tools when the user asks about ${mcp.id}-related tasks.`)
          sections.push("")
        }
      }

      if (ctx.toolNames.length === 0 && mcpIntegrations.length === 0) {
        sections.push("_No tools configured._")
      }

      return sections.join("\n")
    },
  },
  {
    filename: "HEARTBEAT.md",
    purpose: "Scheduled behaviors and cron config",
    defaultContent: (ctx) => {
      if (ctx.schedules.length === 0) return "# Heartbeat\n\n_No schedules configured._\n"
      return `# Heartbeat\n\n${ctx.schedules.map((s) => `- **${s.name}**: \`${s.cron}\` ${s.enabled ? "(active)" : "(disabled)"}`).join("\n")}\n`
    },
  },
  {
    filename: "TEAM.md",
    purpose: "Coworkers and communication guide",
    readOnly: true,
    defaultContent: (ctx) => {
      if (!ctx.coworkers || ctx.coworkers.length === 0) {
        return "# Team\n\n_No coworkers in this organization._\n"
      }
      const list = ctx.coworkers
        .map((c) => `- **${c.name}** (${c.avatar || "🤖"}) — ${c.description || "Digital employee"}. Status: ${c.status}.`)
        .join("\n")
      return `# Team\n\n## Coworkers\n${list}\n\n## Communication\n- Use \`send_message\` to message a coworker\n- Use \`check_inbox\` to see replies\n- Use \`list_employees\` to discover available team members\n`
    },
  },
  {
    filename: "BOOTSTRAP.md",
    purpose: "Session initialization context",
    defaultContent:
      "# Bootstrap\n\nOn each session start:\n1. Read SOUL.md for behavioral guidelines\n2. Read MEMORY.md for long-term context\n3. Read USER.md for supervisor context\n4. Check HEARTBEAT.md for scheduled tasks\n5. Review TOOLS.md for available capabilities\n6. Review AGENTS.md for connected integrations and how to use them\n",
  },
]

// ─── Runtime Types ─────────────────────────────────────────────────

export interface TriggerContext {
  type: "schedule" | "webhook" | "manual" | "event"
  workflowId?: string
  input?: Record<string, unknown>
  scheduleId?: string
}

export interface DeployResult {
  success: boolean
  volumeId?: string
  error?: string
}

export interface EmployeeRuntimeStatus {
  status: "active" | "running" | "idle" | "stopped" | "error"
  runningContainers: number
  lastActiveAt?: Date
  currentRunId?: string
  containerRunning: boolean
  gatewayUrl?: string
}

export interface ApprovalResponse {
  status: "approved" | "rejected" | "edited"
  response?: string
  responseData?: Record<string, unknown>
  respondedBy: string
}

// ─── Employee Package (consumed by Agent Runner) ───────────────────

export interface EmployeePackage {
  employee: {
    id: string
    name: string
    description?: string | null
    avatar?: string | null
    autonomyLevel: AutonomyLevel
    sandboxMode?: boolean
  }
  agent: {
    systemPrompt: string
    model: string
    modelConfig?: Record<string, unknown> | null
  }
  workspaceFiles: Record<string, string>
  skills: {
    platform: Array<{ name: string; content: string }>
    clawhub: Array<{ slug: string; name: string; description: string | null; content: string; metadata?: unknown }>
  }
  tools: {
    platform: Array<{ name: string; description: string; parameters: unknown }>
    custom: Array<{ name: string; description?: string | null; parameters: unknown; code: string; language: string }>
  }
  workflows: Array<{
    id: string
    name: string
    nodes: unknown
    edges: unknown
    variables: unknown
  }>
  mcpServers: Array<{ name: string; url?: string | null; transport: string }>
  knowledgeBaseGroupIds: string[]
  deploymentConfig: EmployeeDeploymentConfig
  memory: {
    longTerm: string
    recentDailyNotes: Array<{ date: string; content: string }>
  }
  channelIntegrations?: Array<{
    channelId: string
    credentials: Record<string, string>
  }>
  mcpIntegrations?: Array<{
    serverId: string
    command: string
    args: string[]
    env: Record<string, string>
  }>
}
