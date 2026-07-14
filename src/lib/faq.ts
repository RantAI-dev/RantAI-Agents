import { brand } from "@/lib/branding"

export interface FaqItem {
  q: string
  a: string
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: `What is ${brand.productName}?`,
    a: `${brand.productName} is an enterprise AI agent platform that lets you build intelligent chat agents with RAG, create visual AI pipelines, and deploy across multiple channels — web, WhatsApp, email, and embeddable widgets.`,
  },
  {
    q: "What are Chat Agents?",
    a: "Chat Agents are AI-powered conversational agents backed by LLMs and your own knowledge base. They support RAG (Retrieval-Augmented Generation) for accurate, grounded responses, conversation memory, and can escalate to human operators when needed.",
  },
  {
    q: "How do AI Pipelines work?",
    a: "AI Pipelines is a visual drag-and-drop workflow builder. You can chain triggers, LLM calls, tool executions, conditional branches, and approval gates into automated workflows — no code required.",
  },
  {
    q: "Which channels are supported?",
    a: "You can deploy agents on the web portal, embeddable widget, WhatsApp (via Meta Cloud API), and email. One agent can serve multiple channels simultaneously.",
  },
  {
    q: "What's the difference between tiers?",
    a: "All tiers ship the same platform — agents, knowledge base, workflows, channels, and tools. The difference is usage limits: how many agents you can run, how many messages per month, and how much knowledge base capacity. Max removes the caps and adds SSO, audit logs, and dedicated support.",
  },
] as const
