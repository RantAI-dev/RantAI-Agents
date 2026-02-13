"use client"

import {
  MessageSquare,
  Headphones,
  BookOpen,
  BarChart3,
  Settings,
} from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useFeaturesContext } from "@/components/providers/features-provider"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuBadge,
} from "@/components/ui/sidebar"

type FeatureKey = "AGENT" | null

interface MainItem {
  title: string
  url: string
  icon: typeof MessageSquare
  description: string
  badge?: boolean
  feature: FeatureKey
  exact?: boolean
}

const allMainItems: MainItem[] = [
  {
    title: "Chat",
    url: "/dashboard",
    icon: MessageSquare,
    description: "AI conversations",
    feature: null,
    exact: true,
  },
  {
    title: "Agent",
    url: "/dashboard/agent",
    icon: Headphones,
    description: "Customer support",
    badge: true,
    feature: "AGENT",
  },
  {
    title: "Knowledge",
    url: "/dashboard/knowledge",
    icon: BookOpen,
    description: "RAG documents",
    feature: null,
  },
  {
    title: "Statistics",
    url: "/dashboard/statistics",
    icon: BarChart3,
    description: "Stats overview",
    feature: null,
  },
]

const secondaryItems = [
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings,
  },
]

export function NavMain() {
  const pathname = usePathname()
  const { isAgentEnabled } = useFeaturesContext()

  // Filter nav items based on enabled features
  const mainItems = allMainItems.filter((item) => {
    if (item.feature === null) return true
    if (item.feature === "AGENT") return isAgentEnabled
    return true
  })

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider">
          Main
        </SidebarGroupLabel>
        <SidebarMenu>
          {mainItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.url
              : pathname === item.url || pathname.startsWith(item.url + "/")

            return (
              <SidebarMenuItem key={item.title} className="relative group">
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
                <Link
                  href={item.url}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                    "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                </Link>
                {item.badge && (
                  <SidebarMenuBadge className="bg-sidebar-accent text-sidebar-foreground text-xs">
                    0
                  </SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider">
          System
        </SidebarGroupLabel>
        <SidebarMenu>
          {secondaryItems.map((item) => {
            const isActive = pathname.startsWith(item.url)

            return (
              <SidebarMenuItem key={item.title} className="relative group">
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
                <Link
                  href={item.url}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                    "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                </Link>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}
