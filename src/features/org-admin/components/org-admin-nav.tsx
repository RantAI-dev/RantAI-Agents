"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, KeyRound, History, Users, Network } from "@/lib/icons"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/dashboard/settings/organization/general", label: "General", icon: Building2 },
  { href: "/dashboard/settings/organization/members", label: "Members", icon: Users },
  { href: "/dashboard/settings/organization/teams", label: "Teams", icon: Network },
  { href: "/dashboard/settings/organization/sso", label: "SSO", icon: KeyRound },
  { href: "/dashboard/settings/organization/audit", label: "Audit log", icon: History },
] as const

/** The organisation admin tabs, the same shape as the settings tabs they sit beside. */
export function OrgAdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active ? "bg-background text-foreground shadow" : "hover:text-foreground",
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
