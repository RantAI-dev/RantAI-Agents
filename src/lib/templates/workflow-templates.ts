import { NodeType } from "@/lib/workflow/types"
import type {
  WorkflowNodeData,
  TriggerNodeData,
  LlmNodeData,
  TransformNodeData,
  RagSearchNodeData,
  TriggerConfig,
  WorkflowVariables,
} from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  mode?: "STANDARD" | "CHATFLOW"
  category?: "TASK" | "CHATFLOW" | "AUTOMATION"
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
  trigger: TriggerConfig
  variables: WorkflowVariables
  tags: string[]
}

// ─── Template 1: Simple Chat Pipeline ─────────────────────
// Flow: Trigger → LLM → Transform

const simpleChatNodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "llm-1",
    type: NodeType.LLM,
    position: { x: 250, y: 150 },
    data: {
      label: "Chat LLM",
      description: "Process the user message with an LLM",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt: "You are a helpful assistant. Answer the user's question concisely.",
      temperature: 0.7,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: NodeType.TRANSFORM,
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
// Flow: Trigger → RAG Search → LLM → Transform

const ragQANodes: Node<WorkflowNodeData>[] = [
  {
    id: "trigger-1",
    type: NodeType.TRIGGER_MANUAL,
    position: { x: 250, y: 0 },
    data: {
      label: "Manual Trigger",
      nodeType: NodeType.TRIGGER_MANUAL,
      config: {},
    } as TriggerNodeData,
  },
  {
    id: "rag-1",
    type: NodeType.RAG_SEARCH,
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
    type: NodeType.LLM,
    position: { x: 250, y: 300 },
    data: {
      label: "Answer with Context",
      description: "Generate an answer using retrieved context",
      nodeType: NodeType.LLM,
      model: "xiaomi/mimo-v2-flash",
      systemPrompt:
        "Answer the user's question based on the provided context. Cite sources when possible. If the context doesn't contain relevant information, say so.",
      temperature: 0.3,
    } as LlmNodeData,
  },
  {
    id: "transform-1",
    type: NodeType.TRANSFORM,
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

// ─── Exports ──────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "wf-simple-chat",
    name: "Simple Chat Pipeline",
    description: "Basic linear pipeline: trigger → LLM → transform. The simplest workflow to understand the basics.",
    icon: "💬",
    category: "TASK",
    nodes: simpleChatNodes,
    edges: simpleChatEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "message", type: "string", description: "User message", required: true }],
      outputs: [{ name: "response", type: "string", description: "Assistant response", required: true }],
    },
    tags: ["Starter", "Chat"],
  },
  {
    id: "wf-rag-qa",
    name: "RAG Question Answering",
    description: "Search a knowledge base, pass context to an LLM, and return a sourced answer.",
    icon: "📚",
    category: "TASK",
    nodes: ragQANodes,
    edges: ragQAEdges,
    trigger: { type: "manual" },
    variables: {
      inputs: [{ name: "question", type: "string", description: "User question", required: true }],
      outputs: [{ name: "answer", type: "string", description: "Answer with sources", required: true }],
    },
    tags: ["RAG", "Knowledge"],
  },
]
