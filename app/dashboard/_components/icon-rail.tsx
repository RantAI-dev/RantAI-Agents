"use client"

import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  MessageSquare,
  Headphones,
  BookOpen,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  User,
  Bot,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useFeaturesContext } from "@/components/providers/features-provider"

type FeatureKey = "AGENT" | null

interface NavItem {
  title: string
  url: string
  icon: typeof MessageSquare
  exact?: boolean
  feature: FeatureKey
}

const allNavItems: NavItem[] = [
  {
    title: "Chat",
    url: "/dashboard",
    icon: MessageSquare,
    exact: true,
    feature: null,
  },
  {
    title: "Assistants",
    url: "/dashboard/assistants",
    icon: Bot,
    feature: null,
  },
  {
    title: "Agent",
    url: "/dashboard/agent",
    icon: Headphones,
    feature: "AGENT",
  },
  {
    title: "Knowledge",
    url: "/dashboard/knowledge",
    icon: BookOpen,
    feature: null,
  },
  {
    title: "Statistics",
    url: "/dashboard/statistics",
    icon: BarChart3,
    feature: null,
  },
]

const bottomNavItems = [
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings,
  },
]

export function IconRail() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const { isAgentEnabled } = useFeaturesContext()

  // Filter nav items based on enabled features
  const mainNavItems = allNavItems.filter((item) => {
    if (item.feature === null) return true
    if (item.feature === "AGENT") return isAgentEnabled
    return true
  })

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U"

  const isActive = (url: string, exact?: boolean) => {
    if (exact) return pathname === url
    return pathname === url || pathname.startsWith(url + "/")
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full w-[52px] bg-sidebar border-r border-sidebar-border">
        {/* User Avatar with Dropdown */}
        <div className="flex items-center justify-center py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md" aria-label="User menu">
                <Avatar className="h-9 w-9 cursor-pointer hover:ring-2 hover:ring-sidebar-ring transition-all">
                  <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-sm font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-48">
              <div className="px-2 py-1.5 text-sm">
                <p className="font-medium">{session?.user?.name || "Agent"}</p>
                <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/account" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: "/agent/login" })}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 flex flex-col items-center gap-1 py-2">
          {mainNavItems.map((item) => {
            const active = isActive(item.url, item.exact)
            return (
              <Tooltip key={item.url}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.url}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.title}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="flex flex-col items-center gap-1 py-3 border-t border-sidebar-border">
          {bottomNavItems.map((item) => {
            const active = isActive(item.url)
            return (
              <Tooltip key={item.url}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.url}
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                      active
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.title}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex items-center justify-center w-10 h-10 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              >
                <Bell className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Notifications</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
