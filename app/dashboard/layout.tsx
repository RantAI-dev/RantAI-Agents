"use client"

import { useState, Suspense } from "react"
import { SessionProvider } from "next-auth/react"
import { PanelLeft, PanelLeftClose } from "lucide-react"
import { IconRail } from "./_components/icon-rail"
import { AppSidebar } from "./_components/app-sidebar"
import { Button } from "@/components/ui/button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)

  return (
    <SessionProvider>
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
            className="absolute top-3 left-4 z-10 h-8 w-8 text-foreground/60 hover:text-foreground hover:bg-accent"
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
    </SessionProvider>
  )
}
