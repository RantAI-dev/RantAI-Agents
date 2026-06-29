"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sparkles } from "@/lib/icons"
import { Button } from "@/components/ui/button"

// Compact free-plan usage chip for the sidebar footer. Cloud-aware only via
// URLs (free-limits API + billing link), so it stays import-safe and simply
// hides when the API is absent (OSS) or the plan is paid.
interface FreeUsage {
  isFree?: boolean
  nano?: { used: number; limit: number }
  freeModels?: { used: number; limit: number }
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>{used}/{limit}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function PlanUsageBadge() {
  const [usage, setUsage] = useState<FreeUsage | null>(null)

  useEffect(() => {
    const load = () =>
      fetch("/api/dashboard/usage/free-limits", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setUsage(d))
        .catch(() => {})
    load()
    // Refresh live when a message is sent (chat-workspace dispatches this) and
    // when the tab regains focus, so the counts update without a page refresh.
    const onUpdate = () => load()
    window.addEventListener("rantai:usage-updated", onUpdate)
    window.addEventListener("focus", onUpdate)
    return () => {
      window.removeEventListener("rantai:usage-updated", onUpdate)
      window.removeEventListener("focus", onUpdate)
    }
  }, [])

  if (!usage?.isFree) return null

  return (
    <div className="mx-2 mb-2 rounded-lg border border-border/60 bg-muted/40 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" /> Free plan
      </div>
      {usage.freeModels && <UsageRow label="Free models / hr" used={usage.freeModels.used} limit={usage.freeModels.limit} />}
      {usage.nano && <UsageRow label="Nano / day" used={usage.nano.used} limit={usage.nano.limit} />}
      <Button asChild size="sm" className="mt-2 h-7 w-full text-xs">
        <Link href="/dashboard/settings/billing">Upgrade</Link>
      </Button>
    </div>
  )
}
