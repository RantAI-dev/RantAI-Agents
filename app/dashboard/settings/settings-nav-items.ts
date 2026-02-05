import { Settings, Radio, Info, ToggleLeft, Code } from "lucide-react"

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
    title: "Channels",
    href: "/dashboard/settings/channels",
    icon: Radio,
    description: "Channel configuration",
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

