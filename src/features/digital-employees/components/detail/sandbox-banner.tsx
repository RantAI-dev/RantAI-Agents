"use client"

import { useState } from "react"
import { AlertTriangle, Rocket, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface SandboxBannerProps {
  employeeId: string
  onGoLive?: () => void
}

export function SandboxBanner({ employeeId, onGoLive }: SandboxBannerProps) {
  const [isGoingLive, setIsGoingLive] = useState(false)

  const handleGoLive = async () => {
    setIsGoingLive(true)
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employeeId}/go-live`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to go live")
      toast.success("Sandbox mode disabled — employee is now live")
      onGoLive?.()
    } catch {
      toast.error("Failed to go live")
    } finally {
      setIsGoingLive(false)
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-500">Sandbox Mode</p>
        <p className="text-xs text-muted-foreground">
          External tool calls are simulated. No real actions are taken.
        </p>
      </div>
      <Button
        size="sm"
        onClick={handleGoLive}
        disabled={isGoingLive}
      >
        {isGoingLive ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Rocket className="h-3.5 w-3.5 mr-1.5" />
        )}
        Go Live
      </Button>
    </div>
  )
}
