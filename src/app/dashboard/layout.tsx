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
import { Menu } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const title = getPageTitle(pathname ?? "")
    document.title = title ? `${title} | ${brand.productName}` : brand.productName
    setMobileSidebarOpen(false)
  }, [pathname])

  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), [])
  const openSearch = useCallback(() => {
    setMobileSidebarOpen(false)
    setSearchOpen(true)
  }, [])

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

  // Global ⌘B shortcut: collapse on desktop, open the drawer on mobile.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (window.matchMedia("(max-width: 767px)").matches) {
          setMobileSidebarOpen((prev) => !prev)
        } else {
          setSidebarOpen((prev) => !prev)
        }
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // Auto collapse/expand sidebar when artifact panel opens/closes
  const sidebarBeforeArtifactRef = React.useRef<boolean | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      const { open } = (e as CustomEvent<{ open: boolean }>).detail
      if (open) {
        // Save current state and collapse
        sidebarBeforeArtifactRef.current = sidebarOpen
        setSidebarOpen(false)
        setMobileSidebarOpen(false)
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
              <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                <div className="flex h-screen w-full overflow-hidden">
                  {/* Desktop sidebar */}
                  <div className="hidden h-full md:block">
                    <Suspense fallback={null}>
                      <AppSidebar
                        isOpen={sidebarOpen}
                        onToggle={toggleSidebar}
                        onSearchOpen={openSearch}
                      />
                    </Suspense>
                  </div>
                  <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

                  {/* Main Content */}
                  <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
                    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:hidden">
                      <SheetTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="-ml-1 size-9"
                          aria-label="Open navigation"
                        >
                          <Menu className="size-5" aria-hidden />
                        </Button>
                      </SheetTrigger>
                      <span className="truncate text-sm font-medium text-foreground">
                        {getPageTitle(pathname ?? "")}
                      </span>
                    </header>
                    <GlobalApprovalBanner />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <ErrorBoundary>
                        {children}
                      </ErrorBoundary>
                    </div>
                  </main>

                  <SheetContent
                    side="left"
                    className="w-[280px] max-w-[85vw] gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
                  >
                    <SheetHeader className="sr-only">
                      <SheetTitle>Navigation</SheetTitle>
                      <SheetDescription>
                        Navigate between dashboard sections and recent conversations.
                      </SheetDescription>
                    </SheetHeader>
                    <Suspense fallback={null}>
                      <div
                        className="h-full"
                        onClickCapture={(event) => {
                          const target = event.target as HTMLElement
                          if (target.closest("a[href]")) setMobileSidebarOpen(false)
                        }}
                      >
                        <AppSidebar
                          isOpen
                          mobile
                          onToggle={() => setMobileSidebarOpen(false)}
                          onSearchOpen={openSearch}
                        />
                      </div>
                    </Suspense>
                  </SheetContent>
                </div>
              </Sheet>
            </UpgradeModalProvider>
          </ChatSessionsProvider>
        </OrganizationProvider>
      </FeaturesProvider>
    </SessionProvider>
  )
}
