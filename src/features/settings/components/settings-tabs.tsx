"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

interface Tab {
  value: string
  label: string
}

interface SettingsTabsProps {
  basePath: string
  activeTab: string
  tabs: Tab[]
}

export function SettingsTabs({ basePath, activeTab, tabs }: SettingsTabsProps) {
  return (
    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={`${basePath}?tab=${tab.value}`}
          replace
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            activeTab === tab.value
              ? "bg-background text-foreground shadow"
              : "hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
