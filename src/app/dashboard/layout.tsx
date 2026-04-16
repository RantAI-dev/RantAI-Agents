"use client"

import React, { useState, Suspense, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { AppSidebar } from "./_components/app-sidebar"
import { FeaturesProvider } from "@/components/providers/features-provider"
import { ChatSessionsProvider } from "@/hooks/use-chat-sessions"
import { OrganizationProvider } from "@/hooks/use-organization"
import { brand } from "@/lib/branding"
import { ErrorBoundary } from "@/components/error-boundary"
import { GlobalApprovalBanner } from "./_components/global-approval-banner"
import { GlobalSearch } from "./_components/global-search"
import { UpgradeModalProvider } from "@cloud/components/upgrade-modal-provider"

const DASHBOARD_TITLES: Record<string, string> = {
  "/dashboard": "Chat",
  "/dashboard/chat": "Chat",
  "/dashboard/agent-builder": "Agent Builder",
  "/dashboard/workflows": "Workflows",
  "/dashboard/agent": "Live Chat",
  "/dashboard/files": "Files",
  "/dashboard/marketplace": "Marketplace",
  "/dashboard/organization": "Organization",
  "/dashboard/settings": "Settings",
  "/dashboard/account": "Account",
}

function getPageTitle(pathname: string): string {
  if (DASHBOARD_TITLES[pathname]) return DASHBOARD_TITLES[pathname]
  if (pathname.startsWith("/dashboard/chat/")) return "Chat"
  if (pathname.startsWith("/dashboard/agent-builder/")) return "Agent Builder"
  if (pathname.startsWith("/dashboard/workflows/")) return "Workflows"
  if (pathname.startsWith("/dashboard/marketplace/")) return "Marketplace"
  if (pathname.startsWith("/dashboard/organization/")) return "Organization"
  if (pathname.startsWith("/dashboard/settings/")) return "Settings"
  return "Dashboard"
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const title = getPageTitle(pathname ?? "")
    document.title = title ? `${title} | ${brand.productName}` : brand.productName
  }, [pathname])

  // Global ⌘K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), [])

  // Auto collapse/expand sidebar when artifact panel opens/closes
  const sidebarBeforeArtifactRef = React.useRef<boolean | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      const { open } = (e as CustomEvent<{ open: boolean }>).detail
      if (open) {
        // Save current state and collapse
        sidebarBeforeArtifactRef.current = sidebarOpen
        setSidebarOpen(false)
      } else {
        // Restore previous state
        if (sidebarBeforeArtifactRef.current !== null) {
          setSidebarOpen(sidebarBeforeArtifactRef.current)
          sidebarBeforeArtifactRef.current = null
        }
      }
    }
    window.addEventListener("artifact-panel-changed", handler)
    return () => window.removeEventListener("artifact-panel-changed", handler)
  }, [sidebarOpen])

  return (
    <SessionProvider>
      <FeaturesProvider>
        <OrganizationProvider>
        <ChatSessionsProvider>
        <UpgradeModalProvider>
          <div className="flex h-screen w-full overflow-hidden">
          {/* Single Unified Sidebar */}
          <Suspense fallback={null}>
            <AppSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} onSearchOpen={() => setSearchOpen(true)} />
          </Suspense>
          <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

          {/* Main Content */}
          <main className="relative flex-1 flex flex-col h-full overflow-hidden bg-background">
            <GlobalApprovalBanner />
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
        </UpgradeModalProvider>
        </ChatSessionsProvider>
        </OrganizationProvider>
      </FeaturesProvider>
    </SessionProvider>
  )
}
