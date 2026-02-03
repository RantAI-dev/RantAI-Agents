"use client"

import {
  MessageSquare,
  Headphones,
  BookOpen,
  LayoutDashboard,
  Settings,
} from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuBadge,
} from "@/components/ui/sidebar"

const mainItems = [
  {
    title: "Chat",
    url: "/dashboard/chat",
    icon: MessageSquare,
    description: "AI conversations",
  },
  {
    title: "Agent",
    url: "/dashboard/agent",
    icon: Headphones,
    description: "Customer support",
    badge: true, // Will show queue count
  },
  {
    title: "Knowledge",
    url: "/dashboard/knowledge",
    icon: BookOpen,
    description: "RAG documents",
  },
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    description: "Stats overview",
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

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider">
          Main
        </SidebarGroupLabel>
        <SidebarMenu>
          {mainItems.map((item) => {
            const isActive = pathname === item.url ||
              (item.url !== "/dashboard" && pathname.startsWith(item.url))

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
