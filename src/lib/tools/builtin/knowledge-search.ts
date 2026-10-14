import { z } from "zod"
import { retrieveKnowledge } from "@/lib/kb-client/facade"
import { findAssistantById } from "@/features/assistants/core/repository"
import type { ToolDefinition } from "../types"

export const knowledgeSearchTool: ToolDefinition = {
  name: "knowledge_search",
  displayName: "Knowledge Base Search",
  description:
    "Search the knowledge base for relevant product information, policies, documentation, and FAQs. Use this when the user asks about products, coverage, pricing, or any topic that may be in the knowledge base.",
  category: "builtin",
  parameters: z.object({
    query: z.string().describe("The search query to find relevant information"),
    maxResults: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return"),
  }),
  execute: async (params, context) => {
    if (!context?.organizationId) {
      return {
        found: false,
        resultCount: 0,
        context: "",
        sources: [],
      }
    }

    let groupIds: string[] | undefined
    if (context.assistantId) {
      try {
        const assistant = await findAssistantById(context.assistantId)
        if (assistant?.knowledgeBaseGroupIds && assistant.knowledgeBaseGroupIds.length > 0) {
          groupIds = assistant.knowledgeBaseGroupIds
        }
      } catch (err) {
        console.warn("[knowledge_search] failed to lookup assistant for groupIds:", err)
      }
    }

    // Routes to the standalone KB service when KB_SERVICE_URL is set,
    // otherwise runs the engine in-process.
    const result = await retrieveKnowledge(params.query as string, {
      maxChunks: (params.maxResults as number) || 5,
      organizationId: context.organizationId,
      groupIds,
    })
    return {
      found: result.chunks.length > 0,
      resultCount: result.chunks.length,
      context: result.context,
      sources: result.sources,
    }
  },
}
