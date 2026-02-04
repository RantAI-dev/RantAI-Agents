"use client"

import { useEffect } from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { useSession } from "next-auth/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Shield, User, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useProfileStore } from "@/hooks/use-profile"

const navItems = [
  {
    title: "Profile",
    href: "/dashboard/account",
    icon: User,
    description: "Your account details",
  },
  {
    title: "Settings",
    href: "/dashboard/settings/general",
    icon: Settings,
    description: "App preferences",
  },
]

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  const { data: session } = useSession()
  const pathname = usePathname()
  const { avatarUrl, fetchProfile } = useProfileStore()

  // Fetch profile on mount
  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "AG"

  const ProfileSidebar = () => (
    <div className="flex flex-col h-full bg-gradient-to-b from-panel-from via-panel-via via-[61%] to-panel-to">
      {/* Profile Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-12 w-12 border-2 border-sidebar-border">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={session?.user?.name || "Agent"} />}
            <AvatarFallback className="bg-sidebar-hover text-sidebar-foreground font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sidebar-foreground truncate">
              {session?.user?.name || "Agent"}
            </h3>
            <p className="text-xs text-sidebar-muted truncate">
              {session?.user?.email}
            </p>
          </div>
        </div>
        <Badge className="bg-sidebar-hover text-sidebar-foreground hover:bg-sidebar-accent">
          <Shield className="h-3 w-3 mr-1" />
          Agent Account
        </Badge>
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
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="text-xs text-sidebar-muted space-y-1">
          <div className="flex justify-between">
            <span>Session</span>
            <span className="text-green-400">Active</span>
          </div>
          <div className="flex justify-between">
            <span>User ID</span>
            <span className="font-mono">{session?.user?.id?.slice(0, 8) || "—"}...</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b pl-14 pr-4 bg-background">
        <h1 className="text-lg font-semibold">Account</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          // Mobile: Stack layout
          <div className="flex flex-col h-full">
            {/* Mobile Profile Header */}
            <div className="border-b p-4 bg-gradient-to-r from-panel-from to-panel-to">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-sidebar-border">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={session?.user?.name || "Agent"} />}
                  <AvatarFallback className="bg-sidebar-hover text-sidebar-foreground font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sidebar-foreground truncate">
                    {session?.user?.name || "Agent"}
                  </h3>
                  <p className="text-xs text-sidebar-muted truncate">
                    {session?.user?.email}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="max-w-2xl mx-auto p-6">{children}</div>
            </div>
          </div>
        ) : (
          // Desktop: Resizable panels
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={22} minSize={18} maxSize={28}>
              <ProfileSidebar />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={78}>
              <div className="h-full overflow-auto">
                <div className="max-w-2xl mx-auto p-6">{children}</div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}
