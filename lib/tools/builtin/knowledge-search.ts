import { z } from "zod"
import { smartRetrieve } from "@/lib/rag/retriever"
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
  execute: async (params) => {
    const result = await smartRetrieve(params.query as string, {
      maxChunks: (params.maxResults as number) || 5,
    })
    return {
      found: result.chunks.length > 0,
      resultCount: result.chunks.length,
      context: result.context,
      sources: result.sources,
    }
  },
}
