"use client"

import { useState, Suspense } from "react"
import { SessionProvider } from "next-auth/react"
import { PanelLeft, PanelLeftClose } from "lucide-react"
import { IconRail } from "./_components/icon-rail"
import { AppSidebar } from "./_components/app-sidebar"
import { Button } from "@/components/ui/button"
import { FeaturesProvider } from "@/components/providers/features-provider"
import { ChatSessionsProvider } from "@/hooks/use-chat-sessions"
import { OrganizationProvider } from "@/hooks/use-organization"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)

  return (
    <SessionProvider>
      <FeaturesProvider>
        <OrganizationProvider>
        <ChatSessionsProvider>
          <div className="flex h-screen w-full overflow-hidden">
          {/* Icon Rail - always visible */}
          <IconRail />

          {/* Expandable Content Sidebar */}
          <Suspense fallback={null}>
            <AppSidebar isOpen={sidebarOpen} />
          </Suspense>

          {/* Main Content */}
          <main className="relative flex-1 flex flex-col h-full overflow-hidden bg-background">
            {/* Sidebar Toggle - positioned in the header area */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="absolute top-4 left-4 z-10 h-8 w-8 text-foreground/60 hover:text-foreground hover:bg-accent"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>
            {children}
          </main>
        </div>
        </ChatSessionsProvider>
        </OrganizationProvider>
      </FeaturesProvider>
    </SessionProvider>
  )
}
