"use client"

import { SettingsNav } from "./_components/settings-nav"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b pl-14 pr-4 bg-background">
        <h1 className="text-lg font-semibold">Settings</h1>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          // Mobile: Stack layout
          <div className="flex flex-col h-full">
            <div className="border-b bg-gradient-to-r from-panel-from to-panel-to">
              <SettingsNav horizontal />
            </div>
            <div className="flex-1 overflow-auto">
              <div className="max-w-4xl mx-auto p-6">{children}</div>
            </div>
          </div>
        ) : (
          // Desktop: Resizable panels
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={22} minSize={18} maxSize={28}>
              <SettingsNav />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={78}>
              <div className="h-full overflow-auto">
                <div className="max-w-4xl mx-auto p-6">{children}</div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}
