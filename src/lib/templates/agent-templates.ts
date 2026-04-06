import type { MemoryConfig } from "@/lib/types/assistant"
import { PROMPT_TEMPLATES } from "@/lib/assistants/prompt-templates"

export interface AgentTemplate {
  id: string
  name: string
  description: string
  emoji: string
  systemPrompt: string
  model: string
  suggestedToolNames: string[]
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  memoryConfig: MemoryConfig
  tags: string[]
}

function getPrompt(id: string): string {
  return PROMPT_TEMPLATES.find((t) => t.id === id)?.systemPrompt ?? ""
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "tpl-customer-support",
    name: "Customer Support Agent",
    description:
      "Empathetic support agent with knowledge base access, customer lookup, and escalation handling.",
    emoji: "🎧",
    systemPrompt: getPrompt("customer-support"),
    model: "openai/gpt-5-mini",
    suggestedToolNames: ["knowledge_search", "customer_lookup"],
    useKnowledgeBase: true,
    knowledgeBaseGroupIds: [],
    memoryConfig: {
      enabled: true,
      workingMemory: true,
      semanticRecall: true,
      longTermProfile: true,
      memoryInstructions:
        "Remember customer names, previous issues, and preferences across conversations.",
    },
    tags: ["Support", "RAG"],
  },
  {
    id: "tpl-knowledge-assistant",
    name: "Knowledge Assistant",
    description:
      "RAG-powered assistant that retrieves from your knowledge base and cites sources accurately.",
    emoji: "📚",
    systemPrompt: getPrompt("knowledge-assistant"),
    model: "anthropic/claude-haiku-4.5",
    suggestedToolNames: ["knowledge_search", "document_analysis"],
    useKnowledgeBase: true,
    knowledgeBaseGroupIds: [],
    memoryConfig: {
      enabled: true,
      workingMemory: true,
      semanticRecall: true,
      longTermProfile: false,
    },
    tags: ["RAG", "Research"],
  },
  {
    id: "tpl-code-helper",
    name: "Code Helper",
    description:
      "Programming assistant for writing, debugging, and explaining code with calculator and web search.",
    emoji: "💻",
    systemPrompt: getPrompt("code-helper"),
    model: "anthropic/claude-sonnet-4.5",
    suggestedToolNames: ["calculator", "web_search"],
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    memoryConfig: {
      enabled: true,
      workingMemory: true,
      semanticRecall: false,
      longTermProfile: false,
    },
    tags: ["Development"],
  },
  {
    id: "tpl-sales-agent",
    name: "Sales Agent",
    description:
      "Product-focused sales assistant with knowledge base for product details and calculator for pricing.",
    emoji: "💼",
    systemPrompt: getPrompt("sales"),
    model: "openai/gpt-5-mini",
    suggestedToolNames: ["knowledge_search", "calculator"],
    useKnowledgeBase: true,
    knowledgeBaseGroupIds: [],
    memoryConfig: {
      enabled: true,
      workingMemory: true,
      semanticRecall: true,
      longTermProfile: true,
      memoryInstructions:
        "Track customer preferences, budget constraints, and purchase history.",
    },
    tags: ["Sales", "RAG"],
  },
  {
    id: "tpl-data-analyst",
    name: "Data Analyst",
    description:
      "Data interpretation assistant with calculator, JSON transforms, and date/time utilities.",
    emoji: "📊",
    systemPrompt: getPrompt("data-analyst"),
    model: "openai/gpt-5-mini",
    suggestedToolNames: ["calculator", "json_transform", "date_time"],
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    memoryConfig: {
      enabled: false,
      workingMemory: false,
      semanticRecall: false,
      longTermProfile: false,
    },
    tags: ["Analytics"],
  },
  {
    id: "tpl-content-writer",
    name: "Content Writer",
    description:
      "Creative content and copywriting assistant with web search for research and text utilities.",
    emoji: "✍️",
    systemPrompt: getPrompt("content-writer"),
    model: "anthropic/claude-sonnet-4.5",
    suggestedToolNames: ["web_search", "text_utilities"],
    useKnowledgeBase: false,
    knowledgeBaseGroupIds: [],
    memoryConfig: {
      enabled: true,
      workingMemory: true,
      semanticRecall: false,
      longTermProfile: false,
    },
    tags: ["Creative"],
  },
  {
    id: "tpl-research-agent",
    name: "Research Agent",
    description:
      "Deep research agent combining web search, knowledge base retrieval, and document analysis.",
    emoji: "🔬",
    systemPrompt: `You are a thorough research assistant. Your goal is to gather, synthesize, and present information from multiple sources to answer complex questions.

Guidelines:
- Search the knowledge base and web to gather comprehensive information
- Cross-reference multiple sources to verify accuracy
- Organize findings with clear structure: summary, key findings, details, sources
- Distinguish between facts, expert opinions, and speculation
- Note conflicting information and present balanced perspectives
- Provide citations and source references for claims
- Suggest follow-up research directions when appropriate
- Use document analysis to extract insights from uploaded files`,
    model: "google/gemini-3-pro-preview",
    suggestedToolNames: ["web_search", "knowledge_search", "document_analysis"],
    useKnowledgeBase: true,
    knowledgeBaseGroupIds: [],
    memoryConfig: {
      enabled: true,
      workingMemory: true,
      semanticRecall: true,
      longTermProfile: false,
    },
    tags: ["Research", "RAG"],
  },
]
