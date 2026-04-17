import { streamText, convertToModelMessages, stepCountIs } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { prisma } from "@/lib/prisma"
import { AVAILABLE_MODELS } from "@/lib/models"
import { buildWizardTools, filterKnownIds, type WizardDeps } from "./tools"
import {
  type WizardMessage,
  type WizardDraft,
  type ProposeAgentInput,
} from "./schema"

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

const WIZARD_MODEL_ID = "anthropic/claude-sonnet-4.6"
const MAX_STEPS = 8

export interface OrgContextCounts {
  organizationId: string
  userRole: string
  existingAgentCount: number
  toolCount: number
  skillCount: number
  mcpCount: number
  kbCount: number
  modelCount: number
}

export function buildWizardSystemPrompt(ctx: OrgContextCounts): string {
  return `You are the Agent Builder Wizard for organization ${ctx.organizationId}. You help the user design a new AI agent by asking targeted questions and proposing a complete draft.

Org context:
- User role: ${ctx.userRole}
- ${ctx.existingAgentCount} existing agents
- ${ctx.toolCount} tools available, ${ctx.skillCount} skills, ${ctx.mcpCount} MCP servers, ${ctx.kbCount} knowledge bases, ${ctx.modelCount} models

Rules:
1. Ask ONE question per turn. Keep it short.
2. Before suggesting any tool/skill/MCP/KB/model IDs, call the relevant list* tool to see what actually exists. Never invent IDs.
3. Ask 2-4 follow-up questions after the user's first description (audience, data access, actions, personality/guardrails). Then call proposeAgent.
4. If the user corrects something mid-conversation, call refineAgent with a partial patch.
5. Pick a sensible default model from listModels (prefer function-calling if tools are needed).
6. System prompt must be at least 20 characters. Use the structure: ## Goal / ## Skills / ## Workflow / ## Constraints.
7. Stop after proposeAgent succeeds unless the user asks for changes.`
}

export interface StreamAssistantWizardArgs {
  messages: WizardMessage[]
  draft: WizardDraft
  organizationId: string
  userId: string
  userRole: string
}

export async function streamAssistantWizard(args: StreamAssistantWizardArgs) {
  const deps: WizardDeps = {
    listModels: async () =>
      AVAILABLE_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        functionCalling: m.capabilities.functionCalling,
        ctx: m.contextWindow,
      })),
    listTools: async (orgId) => {
      const tools = await prisma.tool.findMany({
        where: { OR: [{ organizationId: orgId }, { organizationId: null }] },
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          category: true,
        },
      })
      return tools.map((t) => ({
        id: t.id,
        name: t.displayName || t.name,
        description: t.description,
        category: t.category,
      }))
    },
    listSkills: async (orgId) => {
      const skills = await prisma.skill.findMany({
        where: { OR: [{ organizationId: orgId }, { organizationId: null }] },
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
        },
      })
      return skills.map((s) => ({
        id: s.id,
        name: s.displayName || s.name,
        summary: s.description,
        requiredToolIds: [],
      }))
    },
    listMcpServers: async (orgId) => {
      const servers = await prisma.mcpServerConfig.findMany({
        where: { OR: [{ organizationId: orgId }, { organizationId: null }] },
        select: { id: true, name: true, description: true },
      })
      return servers.map((s) => ({
        id: s.id,
        name: s.name,
        toolSummary: s.description ?? "",
      }))
    },
    listKnowledgeGroups: async (orgId) => {
      const groups = await prisma.knowledgeBaseGroup.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          name: true,
          _count: { select: { documents: true } },
        },
      })
      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        docCount: g._count.documents,
      }))
    },
  }

  const [models, tools, skills, mcp, kbs, agentCount] = await Promise.all([
    deps.listModels(),
    deps.listTools(args.organizationId),
    deps.listSkills(args.organizationId),
    deps.listMcpServers(args.organizationId),
    deps.listKnowledgeGroups(args.organizationId),
    prisma.assistant.count({ where: { organizationId: args.organizationId } }),
  ])

  const system = buildWizardSystemPrompt({
    organizationId: args.organizationId,
    userRole: args.userRole,
    existingAgentCount: agentCount,
    toolCount: tools.length,
    skillCount: skills.length,
    mcpCount: mcp.length,
    kbCount: kbs.length,
    modelCount: models.length,
  })

  const wizardTools = buildWizardTools({
    orgId: args.organizationId,
    userId: args.userId,
    deps,
  })

  // Convert WizardMessage (content: string) to UIMessage format (parts array)
  // that convertToModelMessages expects
  const uiMessages = args.messages.map((m) => ({
    id: `msg_${Math.random().toString(36).slice(2)}`,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
  }))

  const modelMessages = await convertToModelMessages(uiMessages as never)

  return streamText({
    model: openrouter(WIZARD_MODEL_ID),
    system,
    messages: modelMessages,
    tools: wizardTools,
    stopWhen: stepCountIs(MAX_STEPS),
  })
}

export function sanitizeProposal(
  payload: ProposeAgentInput,
  known: {
    models: Set<string>
    tools: Set<string>
    skills: Set<string>
    mcp: Set<string>
    kbs: Set<string>
  }
): { payload: ProposeAgentInput; dropped: Record<string, string[]> } {
  const toolsR = filterKnownIds(payload.selectedToolIds, known.tools)
  const skillsR = filterKnownIds(payload.selectedSkillIds, known.skills)
  const mcpR = filterKnownIds(payload.selectedMcpServerIds, known.mcp)
  const kbsR = filterKnownIds(payload.knowledgeBaseGroupIds, known.kbs)
  const modelOk = known.models.has(payload.model)

  const sanitized: ProposeAgentInput = {
    ...payload,
    model: modelOk ? payload.model : "",
    selectedToolIds: toolsR.kept,
    selectedSkillIds: skillsR.kept,
    selectedMcpServerIds: mcpR.kept,
    knowledgeBaseGroupIds: kbsR.kept,
  }

  return {
    payload: sanitized,
    dropped: {
      model: modelOk ? [] : [payload.model],
      tools: toolsR.dropped,
      skills: skillsR.dropped,
      mcp: mcpR.dropped,
      kbs: kbsR.dropped,
    },
  }
}
