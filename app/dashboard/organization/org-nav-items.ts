import { Building2, Users } from "lucide-react"

export const ORG_NAV_ITEMS = [
  {
    title: "Overview",
    href: "/dashboard/organization",
    icon: Building2,
    description: "Organization settings & info",
  },
  {
    title: "Members",
    href: "/dashboard/organization/members",
    icon: Users,
    description: "Team members & invitations",
  },
] as const
