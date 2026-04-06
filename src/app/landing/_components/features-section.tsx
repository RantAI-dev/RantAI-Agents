"use client"

import { BlurText } from "@/components/reactbits/blur-text"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"
import { Bot, MessageSquare, Workflow, FileSearch, Globe, Users } from "@/lib/icons"
import { landing } from "./landing-styles"

const FEATURES = [
  {
    title: "Chat Agents",
    description: "Create intelligent AI agents powered by LLMs with RAG-enhanced knowledge bases, conversation memory, and human escalation.",
    icon: MessageSquare,
    badge: "",
  },
  {
    title: "AI Pipelines",
    description: "Visual drag-and-drop workflow builder with triggers, conditional branching, LLM nodes, tool execution, and approval gates.",
    icon: Workflow,
    badge: "",
  },
  {
    title: "Multi-Channel Deployment",
    description: "Deploy agents across web portal, WhatsApp (Meta Cloud API), email, and embeddable widget. One agent, every channel.",
    icon: Globe,
    badge: "",
  },
  {
    title: "RAG & Knowledge Base",
    description: "Hybrid semantic search with BM25 fallback, document OCR, and reranking. Feed your agents with PDF, Word, Excel, and more.",
    icon: FileSearch,
    badge: "",
  },
  {
    title: "Human-in-the-Loop",
    description: "Approval workflows, conversation escalation to operators, and supervisor oversight for safe AI operations.",
    icon: Users,
    badge: "",
  },
  {
    title: "Digital Employees",
    description: "Autonomous AI agents in isolated Docker containers with workspace, VNC access, graduated autonomy (L1–L4), and skill marketplace.",
    icon: Bot,
    badge: "Coming Soon",
  },
] as const

export function FeaturesSection() {
  return (
    <section id="features" className={`${landing.sectionAlt} scroll-mt-20`} aria-labelledby="features-heading">
      <div className={landing.container}>
        <BlurText
          text="Everything You Need to Ship AI Agents"
          className="text-3xl font-bold tracking-tight text-center text-zinc-50 mb-4 justify-center"
          delay={50}
          direction="top"
        />
        <p className={landing.sectionSubtitle}>
          From intelligent chat agents to visual pipelines — build, deploy, and manage AI across every channel.
        </p>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <SpotlightCard
                key={f.title}
                className={`${landing.card} flex flex-col p-6 ${f.badge ? "opacity-70" : ""}`}
                spotlightColor="rgba(129,140,248,0.08)"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={landing.iconWrapper}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  {f.badge && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                      {f.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-zinc-100 mb-1">{f.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
              </SpotlightCard>
            )
          })}
        </div>
      </div>
    </section>
  )
}
