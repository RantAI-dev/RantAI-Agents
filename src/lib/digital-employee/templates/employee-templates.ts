export interface TemplateBlueprint {
  tools?: string[]
  skills?: string[]
  integrations?: string[]
  schedules?: Array<{ name: string; cron: string }>
  goals?: Array<{ name: string; type: string; target: number; unit: string; period: string }>
  sampleTasks?: string[]
}

export interface EmployeeTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: string
  suggestedAutonomy: string
  identity: {
    name: string
    description: string
    avatar: string
  }
  tags: string[]
  blueprint?: TemplateBlueprint
}

export const EMPLOYEE_TEMPLATES: EmployeeTemplate[] = [
  {
    id: "customer-support",
    name: "Customer Support Agent",
    description: "Handles customer inquiries, resolves tickets, and escalates complex issues.",
    icon: "🎧",
    category: "Support",
    suggestedAutonomy: "L2",
    identity: {
      name: "Support Agent",
      description: "Handles customer inquiries and resolves tickets efficiently",
      avatar: "🎧",
    },
    tags: ["support", "tickets", "customer"],
    blueprint: {
      integrations: ["slack", "gmail"],
      goals: [
        { name: "Tickets Resolved", type: "counter", target: 20, unit: "tickets", period: "daily" },
        { name: "Response Time", type: "threshold", target: 5, unit: "minutes", period: "daily" },
      ],
      sampleTasks: ["Respond to new support tickets", "Escalate complex issues to supervisor"],
    },
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "Reviews pull requests, checks code quality, and suggests improvements.",
    icon: "🔍",
    category: "Engineering",
    suggestedAutonomy: "L2",
    identity: {
      name: "Code Reviewer",
      description: "Reviews code for quality, security, and best practices",
      avatar: "🔍",
    },
    tags: ["code", "review", "engineering"],
    blueprint: {
      integrations: ["github"],
      goals: [
        { name: "PRs Reviewed", type: "counter", target: 10, unit: "PRs", period: "weekly" },
      ],
      sampleTasks: ["Review new pull requests", "Check code quality and suggest improvements"],
    },
  },
  {
    id: "content-writer",
    name: "Content Writer",
    description: "Creates blog posts, social media content, and marketing copy.",
    icon: "✍️",
    category: "Marketing",
    suggestedAutonomy: "L3",
    identity: {
      name: "Content Writer",
      description: "Creates engaging content for various channels",
      avatar: "✍️",
    },
    tags: ["content", "writing", "marketing"],
    blueprint: {
      integrations: ["notion"],
      schedules: [{ name: "Weekly Content Plan", cron: "0 9 * * 1" }],
      goals: [
        { name: "Articles Written", type: "counter", target: 3, unit: "articles", period: "weekly" },
      ],
      sampleTasks: ["Draft a blog post on a given topic", "Create social media copy for a campaign"],
    },
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Analyzes data, generates reports, and identifies trends.",
    icon: "📊",
    category: "Analytics",
    suggestedAutonomy: "L2",
    identity: {
      name: "Data Analyst",
      description: "Analyzes data patterns and generates actionable insights",
      avatar: "📊",
    },
    tags: ["data", "analytics", "reports"],
    blueprint: {
      schedules: [{ name: "Daily Report", cron: "0 8 * * *" }],
      goals: [
        { name: "Reports Generated", type: "counter", target: 5, unit: "reports", period: "weekly" },
      ],
      sampleTasks: ["Generate a daily sales summary", "Identify trends in user engagement data"],
    },
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    description: "Conducts research, summarizes findings, and compiles reports.",
    icon: "🔬",
    category: "Research",
    suggestedAutonomy: "L3",
    identity: {
      name: "Research Assistant",
      description: "Conducts thorough research and synthesizes information",
      avatar: "🔬",
    },
    tags: ["research", "analysis", "reports"],
    blueprint: {
      goals: [
        { name: "Research Reports", type: "counter", target: 2, unit: "reports", period: "weekly" },
      ],
      sampleTasks: ["Research a given topic and summarize findings", "Compile a competitive analysis report"],
    },
  },
  {
    id: "social-media-manager",
    name: "Social Media Manager",
    description: "Manages social media presence, schedules posts, and engages with audience.",
    icon: "📱",
    category: "Marketing",
    suggestedAutonomy: "L2",
    identity: {
      name: "Social Media Manager",
      description: "Manages social media channels and engages with audience",
      avatar: "📱",
    },
    tags: ["social", "media", "marketing"],
    blueprint: {
      integrations: ["slack", "discord"],
      schedules: [{ name: "Daily Posting", cron: "0 10 * * *" }],
      goals: [
        { name: "Posts Published", type: "counter", target: 5, unit: "posts", period: "weekly" },
        { name: "Engagement Rate", type: "percentage", target: 5, unit: "%", period: "weekly" },
      ],
      sampleTasks: ["Schedule social media posts", "Respond to comments and messages"],
    },
  },
  {
    id: "devops-monitor",
    name: "DevOps Monitor",
    description: "Monitors infrastructure, alerts on issues, and runs basic remediation.",
    icon: "🖥️",
    category: "Engineering",
    suggestedAutonomy: "L1",
    identity: {
      name: "DevOps Monitor",
      description: "Monitors infrastructure health and alerts on anomalies",
      avatar: "🖥️",
    },
    tags: ["devops", "monitoring", "infrastructure"],
    blueprint: {
      integrations: ["slack", "github"],
      schedules: [{ name: "Health Check", cron: "*/15 * * * *" }],
      goals: [
        { name: "Incidents Detected", type: "counter", target: 0, unit: "incidents", period: "daily" },
        { name: "Uptime", type: "percentage", target: 99.9, unit: "%", period: "monthly" },
      ],
      sampleTasks: ["Monitor service health endpoints", "Alert on anomalies and run basic remediation"],
    },
  },
  {
    id: "meeting-assistant",
    name: "Meeting Assistant",
    description: "Summarizes meetings, tracks action items, and sends follow-ups.",
    icon: "📅",
    category: "Productivity",
    suggestedAutonomy: "L3",
    identity: {
      name: "Meeting Assistant",
      description: "Captures meeting notes and tracks follow-up actions",
      avatar: "📅",
    },
    tags: ["meetings", "notes", "productivity"],
    blueprint: {
      integrations: ["slack", "gmail"],
      goals: [
        { name: "Meetings Summarized", type: "counter", target: 10, unit: "meetings", period: "weekly" },
      ],
      sampleTasks: ["Summarize meeting notes and extract action items", "Send follow-up emails with action items"],
    },
  },
]
