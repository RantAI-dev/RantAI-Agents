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
  },
]
