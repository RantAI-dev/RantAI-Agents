"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Power, Wifi, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusToggleProps {
  isOnline: boolean
  isConnected: boolean
  onToggle: () => void
}

export function StatusToggle({
  isOnline,
  isConnected,
  onToggle,
}: StatusToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <Badge
        variant={isOnline ? "default" : "secondary"}
        className={cn(
          "gap-1.5",
          isOnline && "bg-green-600 hover:bg-green-600"
        )}
      >
        {isConnected ? (
          <Wifi className="h-3 w-3" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        {isOnline ? "Online" : "Offline"}
      </Badge>

      <Button
        variant={isOnline ? "destructive" : "default"}
        size="sm"
        onClick={onToggle}
        disabled={!isConnected}
      >
        <Power className="h-4 w-4 mr-1.5" />
        {isOnline ? "Go Offline" : "Go Online"}
      </Button>
    </div>
  )
}
