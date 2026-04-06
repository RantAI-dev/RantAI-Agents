"use client"

import { DashboardPageHeader } from "../_components/dashboard-page-header"

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full">
      <DashboardPageHeader title="Settings" />

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          <div className="max-w-4xl mx-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
