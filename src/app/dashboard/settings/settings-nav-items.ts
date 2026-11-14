import { Settings, Wrench, BarChart3, CreditCard, Building2, KeyRound } from "@/lib/icons"

const isCloudEdition = process.env.NEXT_PUBLIC_EDITION === "cloud"

const baseNavItems = [
  {
    title: "General",
    href: "/dashboard/settings/general",
    icon: Settings,
    description: "Organization, beta features & system info",
  },
  {
    title: "Organisation",
    href: "/dashboard/settings/organization/general",
    icon: Building2,
    description: "Members, teams, single sign-on & audit log",
  },
  {
    title: "API keys",
    href: "/dashboard/settings/api-keys",
    icon: KeyRound,
    description: "Keys the agents use from other platforms",
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
