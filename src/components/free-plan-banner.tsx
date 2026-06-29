"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sparkles, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"

// Dismissible "you're on Free — upgrade" banner. Cloud-aware only via URLs
// (fetches the cloud free-limits API, links to billing) so it stays import-safe
// for the OSS edition, where the API 404s and the banner simply hides.
interface FreeUsage {
  isFree?: boolean
  nano?: { used: number; limit: number }
  freeModels?: { used: number; limit: number }
}

const DISMISS_KEY = "rantai:free-banner-dismissed"

export function FreePlanBanner() {
  const [usage, setUsage] = useState<FreeUsage | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }
    const load = () =>
      fetch("/api/dashboard/usage/free-limits", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setUsage(d))
        .catch(() => {})
    load()
    const onUpdate = () => load()
    window.addEventListener("rantai:usage-updated", onUpdate)
    return () => window.removeEventListener("rantai:usage-updated", onUpdate)
  }, [])

  if (dismissed || !usage?.isFree) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* private mode — best effort */
    }
  }

  return (
    <div className="relative mb-4 flex items-center gap-3 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 px-4 py-2.5 text-sm">
      <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-foreground">You&apos;re on the Free plan.</span>{" "}
        <span className="text-muted-foreground">
          Upgrade for unlimited messages, faster models, and more agents.
        </span>
      </div>
      <Button asChild size="sm" className="h-7 shrink-0">
        <Link href="/dashboard/settings/billing">Upgrade</Link>
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
