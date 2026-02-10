import { NodeType } from "@/lib/workflow/types"
import type {
  WorkflowNodeData,
  TriggerNodeData,
  LlmNodeData,
  TransformNodeData,
  RagSearchNodeData,
  ConditionNodeData,
  HumanInputNodeData,
  ParallelNodeData,
  MergeNodeData,
  HttpNodeData,
  SwitchNodeData,
  ToolNodeData,
  TriggerConfig,
  WorkflowVariables,
} from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
  trigger: TriggerConfig
  variables: WorkflowVariables
  tags: string[]
}

// ─── Template 1: Simple Chat Pipeline ─────────────────────

const simpleChatNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-1",
    type: "workflowNode",
    position: { x: 250, y: 150 },
    data: {
      label: "Chat LLM",
      description: "Process the user message with an LLM",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt: "You are a helpful assistant. Answer the user's question concisely.",
      temperature: 0.7,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: "workflowNode",
    position: { x: 250, y: 300 },
    data: {
      label: "Format Response",
      description: "Transform the LLM output into the final response",
      nodeType: NodeType.TRANSFORM,
      expression: "return { response: input.text, timestamp: new Date().toISOString() };",
    } as TransformNodeData,
  },
]

const simpleChatEdges: Edge[] = [
  { id: "e-trigger-llm", source: "trigger-1", target: "llm-1" },
  { id: "e-llm-transform", source: "llm-1", target: "transform-1" },
]

// ─── Template 2: RAG Question Answering ───────────────────

const ragQANodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "rag-1",
    type: "workflowNode",
    position: { x: 250, y: 150 },
    data: {
      label: "Search Knowledge Base",
      description: "Retrieve relevant documents from the knowledge base",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
      queryTemplate: "{{input.question}}",
    } as RagSearchNodeData,
  },
  {
    id: "llm-1",
    type: "workflowNode",
    position: { x: 250, y: 300 },
    data: {
      label: "Answer with Context",
      description: "Generate an answer using retrieved context",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        "Answer the user's question based on the provided context. Cite sources when possible. If the context doesn't contain relevant information, say so.",
      temperature: 0.3,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: "workflowNode",
    position: { x: 250, y: 450 },
    data: {
      label: "Format Answer",
      description: "Structure the final answer with sources",
      nodeType: NodeType.TRANSFORM,
      expression:
        'return { answer: input.text, sources: input.context || [], answeredAt: new Date().toISOString() };',
    } as TransformNodeData,
  },
]

const ragQAEdges: Edge[] = [
  { id: "e-trigger-rag", source: "trigger-1", target: "rag-1" },
  { id: "e-rag-llm", source: "rag-1", target: "llm-1" },
  { id: "e-llm-transform", source: "llm-1", target: "transform-1" },
]

// ─── Template 3: Content Moderation ───────────────────────

const moderationNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-classify",
    type: "workflowNode",
    position: { x: 250, y: 150 },
    data: {
      label: "Classify Content",
      description: "Classify whether content is safe or needs review",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        'Classify the following content as either "safe" or "needs_review". Respond with a JSON object: { "classification": "safe" | "needs_review", "reason": "brief explanation" }',
      temperature: 0,
    } as LlmNodeData,
  },
  {
    id: "condition-1",
    type: "workflowNode",
    position: { x: 250, y: 300 },
    data: {
      label: "Is Safe?",
      description: "Branch based on classification result",
      nodeType: NodeType.CONDITION,
      conditions: [
        { id: "if", label: "Safe", expression: 'input.classification === "safe"' },
        { id: "else", label: "Needs Review", expression: "true" },
      ],
    } as ConditionNodeData,
  },
  {
    id: "transform-approve",
    type: "workflowNode",
    position: { x: 80, y: 460 },
    data: {
      label: "Auto-Approve",
      description: "Content is safe, auto-approve it",
      nodeType: NodeType.TRANSFORM,
      expression: 'return { status: "approved", reviewedBy: "auto", ...input };',
    } as TransformNodeData,
  },
  {
    id: "human-review",
    type: "workflowNode",
    position: { x: 420, y: 460 },
    data: {
      label: "Human Review",
      description: "Send to a human moderator for review",
      nodeType: NodeType.HUMAN_INPUT,
      prompt: "This content was flagged for review. Please approve or reject it.",
    } as HumanInputNodeData,
  },
]

const moderationEdges: Edge[] = [
  { id: "e-trigger-classify", source: "trigger-1", target: "llm-classify" },
  { id: "e-classify-condition", source: "llm-classify", target: "condition-1" },
  {
    id: "e-condition-approve",
    source: "condition-1",
    sourceHandle: "if",
    target: "transform-approve",
  },
  {
    id: "e-condition-review",
    source: "condition-1",
    sourceHandle: "else",
    target: "human-review",
  },
]

// ─── Template 4: Parallel Data Enrichment ─────────────────

const parallelNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: "workflowNode",
    position: { x: 300, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "parallel-1",
    type: "workflowNode",
    position: { x: 300, y: 130 },
    data: {
      label: "Parallel Split",
      description: "Run multiple enrichment tasks in parallel",
      nodeType: NodeType.PARALLEL,
    } as ParallelNodeData,
  },
  {
    id: "tool-search",
    type: "workflowNode",
    position: { x: 60, y: 270 },
    data: {
      label: "Web Search",
      description: "Search the web for recent information",
      nodeType: NodeType.TOOL,
      toolId: "",
      toolName: "web_search",
      inputMapping: { query: "{{input.query}}" },
    } as ToolNodeData,
  },
  {
    id: "rag-1",
    type: "workflowNode",
    position: { x: 300, y: 270 },
    data: {
      label: "Knowledge Base",
      description: "Search internal knowledge base",
      nodeType: NodeType.RAG_SEARCH,
      knowledgeBaseGroupIds: [],
      topK: 5,
    } as RagSearchNodeData,
  },
  {
    id: "http-1",
    type: "workflowNode",
    position: { x: 540, y: 270 },
    data: {
      label: "External API",
      description: "Fetch data from an external API",
      nodeType: NodeType.HTTP,
      url: "https://api.example.com/data",
      method: "GET",
    } as HttpNodeData,
  },
  {
    id: "merge-1",
    type: "workflowNode",
    position: { x: 300, y: 420 },
    data: {
      label: "Merge Results",
      description: "Combine all enrichment results",
      nodeType: NodeType.MERGE,
      mergeStrategy: "all",
    } as MergeNodeData,
  },
  {
    id: "llm-synthesize",
    type: "workflowNode",
    position: { x: 300, y: 560 },
    data: {
      label: "Synthesize",
      description: "Use LLM to synthesize all gathered data into a coherent response",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        "Synthesize the following data from multiple sources into a comprehensive, well-structured response. Highlight key findings and note any conflicting information.",
      temperature: 0.5,
    } as LlmNodeData,
  },
]

const parallelEdges: Edge[] = [
  { id: "e-trigger-parallel", source: "trigger-1", target: "parallel-1" },
  { id: "e-parallel-search", source: "parallel-1", target: "tool-search" },
  { id: "e-parallel-rag", source: "parallel-1", target: "rag-1" },
  { id: "e-parallel-http", source: "parallel-1", target: "http-1" },
  { id: "e-search-merge", source: "tool-search", target: "merge-1" },
  { id: "e-rag-merge", source: "rag-1", target: "merge-1" },
  { id: "e-http-merge", source: "http-1", target: "merge-1" },
  { id: "e-merge-llm", source: "merge-1", target: "llm-synthesize" },
]

// ─── Template 5: Customer Ticket Router ───────────────────

const ticketRouterNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-webhook",
    type: "workflowNode",
    position: { x: 300, y: 0 },
    data: {
      label: "Webhook Trigger",
      description: "Receive incoming support tickets via webhook",
      nodeType: NodeType.TRIGGER_WEBHOOK,
      config: { webhookPath: "/tickets" },
    } as TriggerNodeData,
  },
  {
    id: "llm-classify",
    type: "workflowNode",
    position: { x: 300, y: 150 },
    data: {
      label: "Classify Ticket",
      description: "Use LLM to classify the ticket category",
      nodeType: NodeType.LLM,
      model: "openai/gpt-5-mini",
      systemPrompt:
        'Classify this support ticket into one of these categories: "technical", "billing", "general". Respond with JSON: { "category": "...", "priority": "low"|"medium"|"high", "summary": "..." }',
      temperature: 0,
    } as LlmNodeData,
  },
  {
    id: "switch-1",
    type: "workflowNode",
    position: { x: 300, y: 310 },
    data: {
      label: "Route by Category",
      description: "Route to the appropriate handler based on category",
      nodeType: NodeType.SWITCH,
      switchOn: "input.category",
      cases: [
        { id: "technical", value: "technical", label: "Technical" },
        { id: "billing", value: "billing", label: "Billing" },
        { id: "general", value: "general", label: "General" },
      ],
    } as SwitchNodeData,
  },
  {
    id: "tool-technical",
    type: "workflowNode",
    position: { x: 60, y: 480 },
    data: {
      label: "Technical Agent",
      description: "Handle with knowledge base search for technical issues",
      nodeType: NodeType.TOOL,
      toolId: "",
      toolName: "knowledge_search",
      inputMapping: { query: "{{input.summary}}" },
    } as ToolNodeData,
  },
  {
    id: "transform-billing",
    type: "workflowNode",
    position: { x: 300, y: 480 },
    data: {
      label: "Billing Lookup",
      description: "Look up billing information and prepare response",
      nodeType: NodeType.TRANSFORM,
      expression:
        'return { action: "billing_lookup", customerId: input.customerId, issue: input.summary };',
    } as TransformNodeData,
  },
  {
    id: "handoff-1",
    type: "workflowNode",
    position: { x: 540, y: 480 },
    data: {
      label: "Human Handoff",
      description: "Escalate general inquiries to a human agent",
      nodeType: NodeType.HANDOFF,
      prompt: "General support ticket requiring human attention.",
    } as HumanInputNodeData,
  },
]

const ticketRouterEdges: Edge[] = [
  { id: "e-trigger-classify", source: "trigger-webhook", target: "llm-classify" },
  { id: "e-classify-switch", source: "llm-classify", target: "switch-1" },
  {
    id: "e-switch-technical",
    source: "switch-1",
    sourceHandle: "technical",
    target: "tool-technical",
  },
  {
    id: "e-switch-billing",
    source: "switch-1",
    sourceHandle: "billing",
    target: "transform-billing",
  },
  {
    id: "e-switch-general",
    source: "switch-1",
    sourceHandle: "general",
    target: "handoff-1",
  },
]

// ─── Exports ──────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "wf-simple-chat",
    name: "Simple Chat Pipeline",
    description:
      "Basic linear pipeline: trigger → LLM → transform. The simplest workflow to understand the basics.",
    icon: "💬",
    nodes: simpleChatNodes,
    edges: simpleChatEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "message", type: "string", description: "User message", required: true },
      ],
      outputs: [
        { name: "response", type: "string", description: "Assistant response", required: true },
      ],
    },
    tags: ["Starter", "Chat"],
  },
  {
    id: "wf-rag-qa",
    name: "RAG Question Answering",
    description:
      "Search a knowledge base, pass context to an LLM, and return a sourced answer.",
    icon: "📖",
    nodes: ragQANodes,
    edges: ragQAEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "question", type: "string", description: "User question", required: true },
      ],
      outputs: [
        { name: "answer", type: "string", description: "Answer with sources", required: true },
      ],
    },
    tags: ["RAG", "Knowledge"],
  },
  {
    id: "wf-content-moderation",
    name: "Content Moderation",
    description:
      "Classify content safety with an LLM, auto-approve safe content, and route flagged content to human review.",
    icon: "🛡️",
    nodes: moderationNodes,
    edges: moderationEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "content", type: "string", description: "Content to moderate", required: true },
      ],
      outputs: [
        { name: "status", type: "string", description: "Moderation result", required: true },
      ],
    },
    tags: ["Moderation", "Human-in-Loop"],
  },
  {
    id: "wf-parallel-enrichment",
    name: "Parallel Data Enrichment",
    description:
      "Run web search, knowledge base retrieval, and API calls in parallel, then merge and synthesize results.",
    icon: "⚡",
    nodes: parallelNodes,
    edges: parallelEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [
        { name: "query", type: "string", description: "Research query", required: true },
      ],
      outputs: [
        { name: "synthesis", type: "string", description: "Synthesized results", required: true },
      ],
    },
    tags: ["Parallel", "Research"],
  },
  {
    id: "wf-ticket-router",
    name: "Customer Ticket Router",
    description:
      "Receive tickets via webhook, classify with LLM, and route to technical, billing, or human agents.",
    icon: "🎫",
    nodes: ticketRouterNodes,
    edges: ticketRouterEdges,
    trigger: { type: "webhook", webhookPath: "/tickets" },
    variables: {
      inputs: [
        { name: "ticket", type: "object", description: "Incoming ticket data", required: true },
      ],
      outputs: [
        { name: "result", type: "object", description: "Routing result", required: true },
      ],
    },
    tags: ["Webhook", "Routing"],
  },
]
