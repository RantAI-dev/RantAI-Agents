import { DEFAULT_MODEL_ID } from "@/lib/models"

// ─── Node Type Enum ──────────────────────────────────────

export enum NodeType {
  // Triggers
  TRIGGER_MANUAL = "trigger_manual",
  TRIGGER_WEBHOOK = "trigger_webhook",
  TRIGGER_SCHEDULE = "trigger_schedule",
  TRIGGER_EVENT = "trigger_event",

  // AI
  AGENT = "agent",
  LLM = "llm",

  // Tools
  TOOL = "tool",
  MCP_TOOL = "mcp_tool",
  CODE = "code",
  HTTP = "http",

  // Flow Control
  CONDITION = "condition",
  SWITCH = "switch",
  LOOP = "loop",
  PARALLEL = "parallel",
  MERGE = "merge",
  ERROR_HANDLER = "error_handler",
  SUB_WORKFLOW = "sub_workflow",

  // Human
  HUMAN_INPUT = "human_input",
  APPROVAL = "approval",
  HANDOFF = "handoff",

  // Data
  TRANSFORM = "transform",
  FILTER = "filter",
  AGGREGATE = "aggregate",
  OUTPUT_PARSER = "output_parser",

  // Integration
  RAG_SEARCH = "rag_search",
  DATABASE = "database",
  STORAGE = "storage",

  // Output
  STREAM_OUTPUT = "stream_output",
}

// ─── Node Categories ─────────────────────────────────────

export type NodeCategory = "trigger" | "ai" | "tools" | "flow" | "human" | "data" | "integration" | "output"

export interface NodeCategoryMeta {
  label: string
  color: string // tailwind bg color class
  headerColor: string // hex for node header
  types: { type: NodeType; label: string; description: string }[]
}

export const NODE_CATEGORIES: Record<NodeCategory, NodeCategoryMeta> = {
  trigger: {
    label: "Triggers",
    color: "bg-emerald-500",
    headerColor: "#10b981",
    types: [
      { type: NodeType.TRIGGER_MANUAL, label: "Manual Trigger", description: "Start workflow manually" },
      { type: NodeType.TRIGGER_WEBHOOK, label: "Webhook", description: "Start via HTTP webhook" },
      { type: NodeType.TRIGGER_SCHEDULE, label: "Schedule", description: "Run on a cron schedule" },
      { type: NodeType.TRIGGER_EVENT, label: "Event", description: "Trigger on system event" },
    ],
  },
  ai: {
    label: "AI",
    color: "bg-violet-500",
    headerColor: "#8b5cf6",
    types: [
      { type: NodeType.AGENT, label: "Agent", description: "Run an AI agent with tools" },
      { type: NodeType.LLM, label: "LLM", description: "Direct LLM call" },
    ],
  },
  tools: {
    label: "Tools",
    color: "bg-blue-500",
    headerColor: "#3b82f6",
    types: [
      { type: NodeType.TOOL, label: "Tool", description: "Execute a registered tool" },
      { type: NodeType.MCP_TOOL, label: "MCP Tool", description: "Execute an MCP tool" },
      { type: NodeType.CODE, label: "Code", description: "Run custom JavaScript code" },
      { type: NodeType.HTTP, label: "HTTP Request", description: "Make an HTTP request" },
    ],
  },
  flow: {
    label: "Flow Control",
    color: "bg-amber-500",
    headerColor: "#f59e0b",
    types: [
      { type: NodeType.CONDITION, label: "Condition", description: "If/else branching" },
      { type: NodeType.SWITCH, label: "Switch", description: "Multi-way branching" },
      { type: NodeType.LOOP, label: "Loop", description: "Iterate over data" },
      { type: NodeType.PARALLEL, label: "Parallel", description: "Run branches in parallel" },
      { type: NodeType.MERGE, label: "Merge", description: "Merge parallel branches" },
      { type: NodeType.ERROR_HANDLER, label: "Error Handler", description: "Try-catch with error branch" },
      { type: NodeType.SUB_WORKFLOW, label: "Sub-Workflow", description: "Execute another workflow" },
    ],
  },
  human: {
    label: "Human",
    color: "bg-pink-500",
    headerColor: "#ec4899",
    types: [
      { type: NodeType.HUMAN_INPUT, label: "Human Input", description: "Wait for human input" },
      { type: NodeType.APPROVAL, label: "Approval", description: "Require human approval" },
      { type: NodeType.HANDOFF, label: "Handoff", description: "Hand off to a human agent" },
    ],
  },
  data: {
    label: "Data",
    color: "bg-cyan-500",
    headerColor: "#06b6d4",
    types: [
      { type: NodeType.TRANSFORM, label: "Transform", description: "Transform data" },
      { type: NodeType.FILTER, label: "Filter", description: "Filter data" },
      { type: NodeType.AGGREGATE, label: "Aggregate", description: "Combine data" },
      { type: NodeType.OUTPUT_PARSER, label: "Output Parser", description: "Parse LLM JSON output" },
    ],
  },
  integration: {
    label: "Integration",
    color: "bg-orange-500",
    headerColor: "#f97316",
    types: [
      { type: NodeType.RAG_SEARCH, label: "RAG Search", description: "Search knowledge base" },
      { type: NodeType.DATABASE, label: "Database", description: "Database operations" },
      { type: NodeType.STORAGE, label: "Storage", description: "File storage operations" },
    ],
  },
  output: {
    label: "Output",
    color: "bg-rose-500",
    headerColor: "#f43f5e",
    types: [
      { type: NodeType.STREAM_OUTPUT, label: "Stream Output", description: "Stream LLM response to user (chatflow)" },
    ],
  },
}

// ─── Node Data Interfaces ────────────────────────────────

export interface BaseNodeData {
  [key: string]: unknown
  label: string
  description?: string
  notes?: string
  nodeType: NodeType
}

export interface TriggerNodeData extends BaseNodeData {
  nodeType: NodeType.TRIGGER_MANUAL | NodeType.TRIGGER_WEBHOOK | NodeType.TRIGGER_SCHEDULE | NodeType.TRIGGER_EVENT
  config: {
    schedule?: string
    webhookPath?: string
    webhookSecret?: string
    eventName?: string
  }
}

export interface AgentNodeData extends BaseNodeData {
  nodeType: NodeType.AGENT
  assistantId: string
  assistantName?: string
  assistantEmoji?: string
  promptTemplate?: string
  maxSteps?: number
}

export interface LlmNodeData extends BaseNodeData {
  nodeType: NodeType.LLM
  model: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number  // Nucleus sampling (0-1), default: 1
  frequencyPenalty?: number  // Penalize token repetition by frequency (-2.0 to 2.0), default: 0
  presencePenalty?: number  // Penalize tokens based on presence (-2.0 to 2.0), default: 0
  stopSequences?: string[]  // Array of strings where generation should stop
}

export interface ToolNodeData extends BaseNodeData {
  nodeType: NodeType.TOOL | NodeType.MCP_TOOL
  toolId: string
  toolName: string
  inputMapping: Record<string, string>
  credentialId?: string
}

export interface CodeNodeData extends BaseNodeData {
  nodeType: NodeType.CODE
  code: string
  runtime: "javascript"
}

export interface HttpNodeData extends BaseNodeData {
  nodeType: NodeType.HTTP
  url: string
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  headers?: Record<string, string>
  body?: string
  credentialId?: string
  timeout?: number  // Request timeout in milliseconds (default: 30000)
  maxRetries?: number  // Max retry attempts on failure (default: 0)
  responseType?: "json" | "text" | "blob"  // Expected response type (default: auto-detect)
}

export interface ConditionNodeData extends BaseNodeData {
  nodeType: NodeType.CONDITION
  conditions: Array<{
    id: string
    label: string
    expression: string
  }>
}

export interface SwitchNodeData extends BaseNodeData {
  nodeType: NodeType.SWITCH
  switchOn: string
  cases: Array<{
    id: string
    value: string
    label: string
  }>
  defaultCase?: string
}

export interface LoopNodeData extends BaseNodeData {
  nodeType: NodeType.LOOP
  loopType: "foreach" | "dowhile" | "dountil"
  condition?: string
  concurrency?: number
  itemVariable?: string
  itemsPath?: string  // Path to extract array from input (e.g., "documents", "data.items")
  maxIterations?: number  // Safety limit to prevent infinite loops (default: 100)
}

export interface ParallelNodeData extends BaseNodeData {
  nodeType: NodeType.PARALLEL
}

export interface MergeNodeData extends BaseNodeData {
  nodeType: NodeType.MERGE
  mergeStrategy: "all" | "any" | "first"
}

export interface HumanInputNodeData extends BaseNodeData {
  nodeType: NodeType.HUMAN_INPUT | NodeType.APPROVAL | NodeType.HANDOFF
  prompt: string
  timeout?: number
  assignTo?: string
}

export interface TransformNodeData extends BaseNodeData {
  nodeType: NodeType.TRANSFORM
  expression: string
}

export interface FilterNodeData extends BaseNodeData {
  nodeType: NodeType.FILTER
  condition: string
}

export interface AggregateNodeData extends BaseNodeData {
  nodeType: NodeType.AGGREGATE
  operation: "concat" | "sum" | "count" | "merge" | "custom"
  expression?: string
}

export interface OutputParserNodeData extends BaseNodeData {
  nodeType: NodeType.OUTPUT_PARSER
  strict: boolean
}

export interface RagSearchNodeData extends BaseNodeData {
  nodeType: NodeType.RAG_SEARCH
  knowledgeBaseGroupIds: string[]
  topK?: number
  queryTemplate?: string
}

export interface DatabaseNodeData extends BaseNodeData {
  nodeType: NodeType.DATABASE
  operation: "query" | "insert" | "update" | "delete"
  query: string
  timeout?: number  // Query timeout in milliseconds (default: 10000)
  resultLimit?: number  // Max rows to return (default: 1000)
}

export interface StorageNodeData extends BaseNodeData {
  nodeType: NodeType.STORAGE
  operation: "read" | "write" | "delete" | "list"
  path?: string
}

export interface ErrorHandlerNodeData extends BaseNodeData {
  nodeType: NodeType.ERROR_HANDLER
  retryCount?: number
  retryDelay?: number
  fallbackValue?: string
}

export interface SubWorkflowNodeData extends BaseNodeData {
  nodeType: NodeType.SUB_WORKFLOW
  workflowId: string
  workflowName?: string
  inputMapping?: Record<string, string>
}

export interface StreamOutputNodeData extends BaseNodeData {
  nodeType: NodeType.STREAM_OUTPUT
  model: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stopSequences?: string[]
}

// ─── Discriminated Union ─────────────────────────────────

export type WorkflowNodeData =
  | TriggerNodeData
  | AgentNodeData
  | LlmNodeData
  | ToolNodeData
  | CodeNodeData
  | HttpNodeData
  | ConditionNodeData
  | SwitchNodeData
  | LoopNodeData
  | ParallelNodeData
  | MergeNodeData
  | ErrorHandlerNodeData
  | SubWorkflowNodeData
  | HumanInputNodeData
  | TransformNodeData
  | FilterNodeData
  | AggregateNodeData
  | OutputParserNodeData
  | RagSearchNodeData
  | DatabaseNodeData
  | StorageNodeData
  | StreamOutputNodeData

// ─── Workflow Variables ──────────────────────────────────

export interface WorkflowVariable {
  name: string
  type: "string" | "number" | "boolean" | "object" | "array"
  description?: string
  required: boolean
  defaultValue?: unknown
}

export interface WorkflowVariables {
  inputs: WorkflowVariable[]
  outputs: WorkflowVariable[]
}

// ─── Trigger Config ──────────────────────────────────────

export interface TriggerConfig {
  type: "manual" | "webhook" | "schedule" | "event"
  schedule?: string
  webhookPath?: string
  eventName?: string
}

// ─── Step Log ────────────────────────────────────────────

export interface StepLogEntry {
  stepId: string
  nodeId: string
  nodeType: string
  label: string
  status: "pending" | "running" | "success" | "failed" | "suspended"
  input: unknown
  output: unknown
  error?: string
  durationMs: number
  startedAt: string
  completedAt?: string
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// ─── Default node data factories ─────────────────────────

export function createDefaultNodeData(nodeType: NodeType): WorkflowNodeData {
  const base = { label: getNodeLabel(nodeType), nodeType }

  switch (nodeType) {
    case NodeType.TRIGGER_MANUAL:
    case NodeType.TRIGGER_WEBHOOK:
    case NodeType.TRIGGER_SCHEDULE:
    case NodeType.TRIGGER_EVENT:
      return { ...base, nodeType, config: {} } as TriggerNodeData

    case NodeType.AGENT:
      return { ...base, nodeType, assistantId: "", maxSteps: 5 } as AgentNodeData

    case NodeType.LLM:
      return { ...base, nodeType, model: DEFAULT_MODEL_ID, temperature: 0.7 } as LlmNodeData

    case NodeType.TOOL:
    case NodeType.MCP_TOOL:
      return { ...base, nodeType, toolId: "", toolName: "", inputMapping: {} } as ToolNodeData

    case NodeType.CODE:
      return { ...base, nodeType, code: "// Write your code here\nreturn { data: input };", runtime: "javascript" } as CodeNodeData

    case NodeType.HTTP:
      return { ...base, nodeType, url: "", method: "GET", timeout: 30000, maxRetries: 0 } as HttpNodeData

    case NodeType.CONDITION:
      return { ...base, nodeType, conditions: [{ id: "if", label: "If", expression: "" }, { id: "else", label: "Else", expression: "true" }] } as ConditionNodeData

    case NodeType.SWITCH:
      return { ...base, nodeType, switchOn: "", cases: [{ id: "case1", value: "", label: "Case 1" }] } as SwitchNodeData

    case NodeType.LOOP:
      return { ...base, nodeType, loopType: "foreach", concurrency: 1, maxIterations: 100 } as LoopNodeData

    case NodeType.PARALLEL:
      return { ...base, nodeType } as ParallelNodeData

    case NodeType.MERGE:
      return { ...base, nodeType, mergeStrategy: "all" } as MergeNodeData

    case NodeType.HUMAN_INPUT:
    case NodeType.APPROVAL:
    case NodeType.HANDOFF:
      return { ...base, nodeType, prompt: "" } as HumanInputNodeData

    case NodeType.TRANSFORM:
      return { ...base, nodeType, expression: "return input;" } as TransformNodeData

    case NodeType.FILTER:
      return { ...base, nodeType, condition: "return true;" } as FilterNodeData

    case NodeType.AGGREGATE:
      return { ...base, nodeType, operation: "merge" } as AggregateNodeData

    case NodeType.OUTPUT_PARSER:
      return { ...base, nodeType, strict: false } as OutputParserNodeData

    case NodeType.RAG_SEARCH:
      return { ...base, nodeType, knowledgeBaseGroupIds: [], topK: 5 } as RagSearchNodeData

    case NodeType.DATABASE:
      return { ...base, nodeType, operation: "query", query: "", timeout: 10000, resultLimit: 1000 } as DatabaseNodeData

    case NodeType.STORAGE:
      return { ...base, nodeType, operation: "read" } as StorageNodeData

    case NodeType.ERROR_HANDLER:
      return { ...base, nodeType, retryCount: 0, retryDelay: 1000 } as ErrorHandlerNodeData

    case NodeType.SUB_WORKFLOW:
      return { ...base, nodeType, workflowId: "", inputMapping: {} } as SubWorkflowNodeData

    case NodeType.STREAM_OUTPUT:
      return { ...base, nodeType, model: DEFAULT_MODEL_ID, temperature: 0.7 } as StreamOutputNodeData

    default:
      return base as WorkflowNodeData
  }
}

function getNodeLabel(nodeType: NodeType): string {
  for (const cat of Object.values(NODE_CATEGORIES)) {
    const found = cat.types.find((t) => t.type === nodeType)
    if (found) return found.label
  }
  return nodeType
}

export function getNodeCategory(nodeType: NodeType): NodeCategory {
  for (const [cat, meta] of Object.entries(NODE_CATEGORIES)) {
    if (meta.types.some((t) => t.type === nodeType)) return cat as NodeCategory
  }
  return "tools"
}

export function getNodeHeaderColor(nodeType: NodeType): string {
  const cat = getNodeCategory(nodeType)
  return NODE_CATEGORIES[cat].headerColor
}
