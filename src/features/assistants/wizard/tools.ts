import { tool } from "ai"
import { z } from "zod"
import {
  ProposeAgentInputSchema,
  RefineAgentInputSchema,
  type ProposeAgentInput,
  type RefineAgentInput,
} from "./schema"

export interface WizardDeps {
  listModels: () => Promise<
    Array<{ id: string; name: string; functionCalling: boolean; ctx: number }>
  >
  listTools: (orgId: string) => Promise<
    Array<{ id: string; name: string; description: string; category: string }>
  >
  listSkills: (orgId: string) => Promise<
    Array<{
      id: string
      name: string
      summary: string
      requiredToolIds: string[]
    }>
  >
  listMcpServers: (
    orgId: string
  ) => Promise<Array<{ id: string; name: string; toolSummary: string }>>
  listKnowledgeGroups: (
    orgId: string
  ) => Promise<Array<{ id: string; name: string; docCount: number }>>
}

export function filterKnownIds(
  ids: string[],
  known: Set<string>
): { kept: string[]; dropped: string[] } {
  const kept: string[] = []
  const dropped: string[] = []
  for (const id of ids) {
    if (known.has(id)) kept.push(id)
    else dropped.push(id)
  }
  return { kept, dropped }
}

export interface BuildWizardToolsArgs {
  orgId: string
  userId: string
  deps: WizardDeps
  onProposal?: (payload: ProposeAgentInput) => void
  onRefinement?: (payload: RefineAgentInput) => void
}

export function buildWizardTools({
  orgId,
  deps,
  onProposal,
  onRefinement,
}: BuildWizardToolsArgs) {
  return {
    listModels: tool({
      description: "List AI models available in this org.",
      inputSchema: z.object({}),
      execute: async () => deps.listModels(),
    }),
    listTools: tool({
      description:
        "List tools available to agents (built-in + custom). Call before suggesting tool IDs.",
      inputSchema: z.object({}),
      execute: async () => deps.listTools(orgId),
    }),
    listSkills: tool({
      description:
        "List skills installed in this org. Each skill may require specific tools.",
      inputSchema: z.object({}),
      execute: async () => deps.listSkills(orgId),
    }),
    listMcpServers: tool({
      description: "List MCP servers connected to this org.",
      inputSchema: z.object({}),
      execute: async () => deps.listMcpServers(orgId),
    }),
    listKnowledgeGroups: tool({
      description: "List knowledge base groups in this org.",
      inputSchema: z.object({}),
      execute: async () => deps.listKnowledgeGroups(orgId),
    }),
    proposeAgent: tool({
      description:
        "Emit the final proposed agent draft. Only call after gathering enough info and listing the relevant catalogs. All IDs must come from list* results.",
      inputSchema: ProposeAgentInputSchema,
      execute: async (payload) => {
        onProposal?.(payload)
        return { ok: true }
      },
    }),
    refineAgent: tool({
      description:
        "Apply a partial update to the current draft (e.g., after the user says 'use GPT-4 instead').",
      inputSchema: RefineAgentInputSchema,
      execute: async (payload) => {
        onRefinement?.(payload)
        return { ok: true }
      },
    }),
  }
}
