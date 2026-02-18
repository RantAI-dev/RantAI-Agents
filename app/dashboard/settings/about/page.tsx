"use client"

import { DashboardPageHeader } from "../../_components/dashboard-page-header"
import {
  MessageSquare,
  Shield,
  Brain,
  Radio,
  Wrench,
  Globe,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import { brand } from "@/lib/branding"

const features = [
  {
    icon: MessageSquare,
    title: "AI Chat",
    description: "Intelligent conversational agents with context-aware responses",
    color: "text-chart-1",
    bg: "bg-chart-1/10",
  },
  {
    icon: Brain,
    title: "Knowledge Base",
    description: "RAG-powered document retrieval with vector search",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: Shield,
    title: "Live Agent Handoff",
    description: "Seamless escalation to human agents with queue management",
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
  {
    icon: Wrench,
    title: "Agentic Tools",
    description: "Built-in, custom, and MCP tool integrations for agents",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    icon: Radio,
    title: "Multi-Channel",
    description: "Deploy across Portal, WhatsApp, Email, and more",
    color: "text-chart-2",
    bg: "bg-chart-2/10",
  },
  {
    icon: Sparkles,
    title: "Memory System",
    description: "Working, semantic, and long-term memory for personalized interactions",
    color: "text-chart-4",
    bg: "bg-chart-4/10",
  },
]

export default function AboutPage() {
  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader title="About" subtitle="System information" />

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
          {/* Hero — Logo + Brand */}
          <div className="flex flex-col items-center text-center space-y-5">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-primary/5 blur-2xl scale-150" />
              <img
                src={brand.logoMain}
                alt={brand.productName}
                className="relative h-20 w-20 rounded-2xl shadow-lg ring-1 ring-border"
              />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight">
                {brand.productName}
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Enterprise AI agent platform with RAG, multi-channel deployment, and human-in-the-loop workflows.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
                v1.0.0
              </span>
              <a
                href={brand.companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                <Globe className="h-3 w-3" />
                {brand.companyUrl.replace("https://", "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Features */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-widest text-center">
              Capabilities
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="group flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-200 hover:shadow-md hover:border-foreground/10"
                >
                  <div className={`rounded-lg p-2 ${f.bg} shrink-0`}>
                    <f.icon className={`h-4 w-4 ${f.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{f.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      {f.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 text-center">
            <p className="text-[11px] font-mono text-muted-foreground/50">
              {brand.companyName} &middot; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
