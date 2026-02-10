"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Code, Globe, ExternalLink, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface TabDeployProps {
  agentId: string | null
  agentName: string
  isNew: boolean
}

export function TabDeploy({ agentId, agentName, isNew }: TabDeployProps) {
  const [copied, setCopied] = useState(false)

  const apiExample = agentId
    ? `POST /api/chat
Content-Type: application/json

{
  "assistantId": "${agentId}",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}`
    : ""

  const handleCopy = () => {
    navigator.clipboard.writeText(apiExample)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isNew) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Globe className="h-8 w-8 text-muted-foreground mb-3" />
        <h3 className="text-base font-semibold mb-1">Save Agent First</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Save the agent to configure deployment options.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Deploy</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Ways to use &quot;{agentName}&quot; in production.
        </p>
      </div>

      {/* API Endpoint */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">API Endpoint</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Send messages to this agent programmatically via the chat API.
        </p>
        <div className="relative">
          <pre className="rounded-lg border bg-muted/50 p-4 text-xs font-mono overflow-x-auto">
            {apiExample}
          </pre>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </section>

      {/* Widget Embed */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Widget Embed</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Embed this agent as a chat widget on your website.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/settings">
            Configure Embed Keys
            <ExternalLink className="ml-1.5 h-3 w-3" />
          </Link>
        </Button>
      </section>

      {/* Agent ID */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Agent ID</h3>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            {agentId}
          </Badge>
        </div>
      </section>
    </div>
  )
}
