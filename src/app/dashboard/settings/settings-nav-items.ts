import { Settings, Wrench, Building2, CreditCard, BarChart3 } from "@/lib/icons"

export const SETTINGS_NAV_ITEMS = [
  {
    title: "General",
    href: "/dashboard/settings/general",
    icon: Settings,
    description: "Features & system info",
  },
  {
    title: "Organization",
    href: "/dashboard/settings/organization",
    icon: Building2,
    description: "Team, members & invitations",
  },
  {
    title: "Billing",
    href: "/dashboard/settings/billing",
    icon: CreditCard,
    description: "Plan, usage & payments",
  },
  {
    title: "Agent Config",
    href: "/dashboard/settings/agent-config",
    icon: Wrench,
    description: "Tools, skills, MCP & credentials",
  },
  {
    title: "Analytics",
    href: "/dashboard/settings/analytics",
    icon: BarChart3,
    description: "Memory & usage statistics",
  },
] as const
