import { Settings, Wrench, BarChart3, CreditCard } from "@/lib/icons"

const isCloudEdition = process.env.NEXT_PUBLIC_EDITION === "cloud"

const baseNavItems = [
  {
    title: "General",
    href: "/dashboard/settings/general",
    icon: Settings,
    description: "Organization, beta features & system info",
  },
]

const cloudOnlyNavItems = [
  {
    title: "Billing",
    href: "/dashboard/settings/billing",
    icon: CreditCard,
    description: "Plan, usage & payments",
  },
]

const commonNavItems = [
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
]

export const SETTINGS_NAV_ITEMS = [
  ...baseNavItems,
  ...(isCloudEdition ? cloudOnlyNavItems : []),
  ...commonNavItems,
] as const
