import { knowledgeSearchTool } from "./knowledge-search"
import { customerLookupTool } from "./customer-lookup"
import { channelDispatchTool } from "./channel-dispatch"
import { documentAnalysisTool } from "./document-analysis"
import { fileOperationsTool } from "./file-operations"
import { webSearchTool } from "./web-search"
import { calculatorTool } from "./calculator"
import { dateTimeTool } from "./date-time"
import { jsonTransformTool } from "./json-transform"
import { textUtilitiesTool } from "./text-utilities"
import type { ToolDefinition } from "../types"

export const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
  knowledge_search: knowledgeSearchTool,
  customer_lookup: customerLookupTool,
  channel_dispatch: channelDispatchTool,
  document_analysis: documentAnalysisTool,
  file_operations: fileOperationsTool,
  web_search: webSearchTool,
  calculator: calculatorTool,
  date_time: dateTimeTool,
  json_transform: jsonTransformTool,
  text_utilities: textUtilitiesTool,
}

export function getBuiltinTool(name: string): ToolDefinition | undefined {
  return BUILTIN_TOOLS[name]
}

export function getAllBuiltinTools(): ToolDefinition[] {
  return Object.values(BUILTIN_TOOLS)
}
