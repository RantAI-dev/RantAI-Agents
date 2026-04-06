import { z } from "zod"
import { extractEntitiesWithPatterns } from "@/lib/document-intelligence"
import type { ToolDefinition } from "../types"

export const documentAnalysisTool: ToolDefinition = {
  name: "document_analysis",
  displayName: "Document Analysis",
  description:
    "Analyze text to extract structured entities such as people, organizations, dates, products, monetary values, emails, phone numbers, and URLs. Useful for parsing unstructured text into structured data.",
  category: "builtin",
  parameters: z.object({
    text: z.string().describe("The text to analyze for entities"),
  }),
  execute: async (params) => {
    const result = extractEntitiesWithPatterns(params.text as string)
    return {
      entityCount: result.entities.length,
      entities: result.entities.map((e) => ({
        text: e.text,
        type: e.type,
        confidence: e.confidence,
      })),
    }
  },
}
