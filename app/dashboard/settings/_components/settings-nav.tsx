"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Settings, Radio, Info, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const navItems = [
  {
    title: "General",
    href: "/dashboard/settings/general",
    icon: Settings,
    description: "Basic preferences",
  },
  {
    title: "Channels",
    href: "/dashboard/settings/channels",
    icon: Radio,
    description: "Channel configuration",
  },
  {
    title: "About",
    href: "/dashboard/settings/about",
    icon: Info,
    description: "System information",
  },
]

interface SettingsNavProps {
  horizontal?: boolean
}

export function SettingsNav({ horizontal }: SettingsNavProps) {
  const pathname = usePathname()

  if (horizontal) {
    return (
      <nav className="flex overflow-x-auto p-3 gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Button
              key={item.href}
              asChild
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "whitespace-nowrap",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-hover"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
              )}
            >
              <Link href={item.href}>
                <item.icon className="h-4 w-4 mr-2" />
                {item.title}
              </Link>
            </Button>
          )
        })}
      </nav>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-panel-from via-panel-via via-[61%] to-panel-to">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <h2 className="text-lg font-semibold text-sidebar-foreground">Settings</h2>
        <p className="text-sm text-sidebar-muted mt-1">Configure your preferences</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 relative",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
              )}
            >
              {/* Animated ink indicator */}
              <div
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
                  "transition-all duration-150 ease-in-out",
                  isActive
                    ? "h-10 opacity-100"
                    : "h-2 opacity-0 group-hover:h-6 group-hover:opacity-100"
                )}
              />
              <item.icon className="h-5 w-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-sidebar-muted truncate">{item.description}</div>
              </div>
              {isActive && <ChevronRight className="h-4 w-4 text-sidebar-foreground/60 shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer/Brand */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <img
            src="/logo/logo-rantai.png"
            alt="RantAI Agents"
            className="h-8 w-8 rounded-lg"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground">RantAI Agents</div>
            <div className="text-xs text-sidebar-muted">Agent Dashboard</div>
          </div>
        </div>
      </div>
    </div>
  )
}
