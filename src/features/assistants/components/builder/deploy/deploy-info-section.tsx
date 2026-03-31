"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "@/lib/icons"

interface DeployInfoSectionProps {
  agentId: string
  agentName: string
  agentModel: string
  agentCreatedAt?: Date
}

export function DeployInfoSection({ agentId, agentName, agentModel, agentCreatedAt }: DeployInfoSectionProps) {
  const [copied, setCopied] = useState(false)

  const copyId = () => {
    navigator.clipboard.writeText(agentId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Agent ID</label>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {agentId}
            </Badge>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyId}>
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Agent Name</label>
          <p className="text-sm">{agentName}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <p className="text-sm font-mono">{agentModel}</p>
        </div>

        {agentCreatedAt && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Created</label>
            <p className="text-sm">{agentCreatedAt.toLocaleDateString()}</p>
          </div>
        )}
      </div>
    </div>
  )
}
