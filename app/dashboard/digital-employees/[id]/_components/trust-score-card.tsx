"use client"

import { useState, useEffect, useCallback } from "react"
import { ArrowUpRight, ArrowDown, Loader2, TrendingUp, TrendingDown, Shield } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"

interface TrustData {
  trustScore: number
  currentLevel: string
  levels: Array<{
    code: string
    label: string
    description: string
    minTrustScore: number
  }>
  promotionSuggestion: string | null
  demotionSuggestion: string | null
  recentEvents: Array<{
    id: string
    eventType: string
    weight: number
    createdAt: string
  }>
}

interface TrustScoreCardProps {
  employeeId: string
  onLevelChange?: () => void
}

const LEVEL_COLORS: Record<string, string> = {
  L1: "text-blue-500",
  L2: "text-sky-500",
  L3: "text-emerald-500",
  L4: "text-purple-500",
}

export function TrustScoreCard({ employeeId, onLevelChange }: TrustScoreCardProps) {
  const [data, setData] = useState<TrustData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPromoting, setIsPromoting] = useState(false)
  const [isDemoting, setIsDemoting] = useState(false)

  const fetchTrust = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/trust`)
      if (res.ok) setData(await res.json())
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [employeeId])

  useEffect(() => { fetchTrust() }, [fetchTrust])

  const handlePromote = async () => {
    setIsPromoting(true)
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/trust/promote`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error)
      const result = await res.json()
      toast.success(`Promoted to ${result.label}`)
      await fetchTrust()
      onLevelChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to promote")
    } finally {
      setIsPromoting(false)
    }
  }

  const handleDemote = async () => {
    setIsDemoting(true)
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/trust/demote`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error)
      const result = await res.json()
      toast.success(`Demoted to ${result.label}`)
      await fetchTrust()
      onLevelChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to demote")
    } finally {
      setIsDemoting(false)
    }
  }

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const currentLevelDef = data.levels.find((l) => l.code === data.currentLevel)
  const scoreColor = data.trustScore >= 70 ? "text-emerald-500" : data.trustScore >= 40 ? "text-amber-500" : "text-red-500"
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (data.trustScore / 100) * circumference

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Shield className="h-4 w-4" />
        Trust & Autonomy
      </div>

      <div className="flex items-center gap-4">
        {/* Progress ring */}
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
            <circle
              cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="4"
              strokeLinecap="round"
              className={scoreColor}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.5s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-lg font-bold", scoreColor)}>{data.trustScore}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-lg font-bold", LEVEL_COLORS[data.currentLevel] || "text-foreground")}>
              {data.currentLevel}
            </span>
            <span className="text-sm font-medium">{currentLevelDef?.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{currentLevelDef?.description}</p>

          <div className="flex items-center gap-1.5 mt-2">
            {data.promotionSuggestion && (
              <Button size="sm" variant="outline" className="h-6 text-xs text-emerald-500" onClick={handlePromote} disabled={isPromoting}>
                {isPromoting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowUpRight className="h-3 w-3 mr-1" />}
                Promote to {data.promotionSuggestion}
              </Button>
            )}
            {data.currentLevel !== "L1" && (
              <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={handleDemote} disabled={isDemoting}>
                {isDemoting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                Demote
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Recent events */}
      {data.recentEvents.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-[11px] text-muted-foreground mb-1">Recent trust events</p>
          <div className="space-y-0.5">
            {data.recentEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-center gap-2 text-xs">
                {event.eventType.includes("success") || event.eventType.includes("accepted") || event.eventType === "promotion" ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
                )}
                <span className="truncate">{formatEventLabel(event.eventType)}</span>
                <span className="text-muted-foreground ml-auto shrink-0">
                  {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    approval_accepted: "Approval accepted",
    approval_rejected: "Approval rejected",
    run_success: "Run succeeded",
    run_failure: "Run failed",
    promotion: "Promoted",
    demotion: "Demoted",
  }
  return labels[eventType] || eventType
}
