import { Settings, Info, ToggleLeft, Code, Wrench, Plug, KeyRound, Brain, BarChart3, CreditCard } from "lucide-react"

export const SETTINGS_NAV_ITEMS = [
  {
    title: "General",
    href: "/dashboard/settings/general",
    icon: Settings,
    description: "Basic preferences",
  },
  {
    title: "Features",
    href: "/dashboard/settings/features",
    icon: ToggleLeft,
    description: "Enable/disable capabilities",
  },
{
    title: "Tools",
    href: "/dashboard/settings/tools",
    icon: Wrench,
    description: "Agent tools configuration",
  },
  {
    title: "MCP",
    href: "/dashboard/settings/mcp",
    icon: Plug,
    description: "MCP clients & server",
  },
  {
    title: "Memory",
    href: "/dashboard/settings/memory",
    icon: Brain,
    description: "AI memory management",
  },
  {
    title: "Statistics",
    href: "/dashboard/settings/statistics",
    icon: BarChart3,
    description: "Analytics & usage metrics",
  },
  {
    title: "Credentials",
    href: "/dashboard/settings/credentials",
    icon: KeyRound,
    description: "API keys & auth for workflows",
  },
  {
    title: "Billing",
    href: "/dashboard/settings/billing",
    icon: CreditCard,
    description: "Plan, usage & payments",
  },
  {
    title: "Embed Widget",
    href: "/dashboard/settings/embed",
    icon: Code,
    description: "Website chat widget",
  },
  {
    title: "About",
    href: "/dashboard/settings/about",
    icon: Info,
    description: "System information",
  },
] as const

