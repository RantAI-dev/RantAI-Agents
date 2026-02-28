"use client"

import { useMemo } from "react"
import Link from "next/link"
import {
  Plug,
  Check,
  AlertTriangle,
  ExternalLink,
  Wifi,
  WifiOff,
  Globe,
  Store,
} from "@/lib/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { useMcpServers, type McpServerItem } from "@/hooks/use-mcp-servers"

const TRANSPORT_ICONS: Record<string, typeof Globe> = {
  sse: Globe,
  "streamable-http": Globe,
}

const TRANSPORT_LABELS: Record<string, string> = {
  sse: "SSE",
  "streamable-http": "HTTP",
}

interface TabMcpProps {
  selectedMcpServerIds: string[]
  onToggleMcpServer: (serverId: string) => void
  modelSupportsFunctionCalling: boolean
  isNew: boolean
}

export function TabMcp({
  selectedMcpServerIds,
  onToggleMcpServer,
  modelSupportsFunctionCalling,
  isNew,
}: TabMcpProps) {
  const { servers, isLoading } = useMcpServers()

  // Only show enabled servers
  const availableServers = useMemo(
    () => servers.filter((s) => s.enabled),
    [servers]
  )

  const getConnectionStatus = (server: McpServerItem) => {
    if (server.lastError) return "error"
    if (server.lastConnectedAt) return "connected"
    return "unknown"
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground">MCP Servers</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Bind MCP servers to this agent. All tools from bound servers will be
          available during conversations.
        </p>
      </div>

      {isNew && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Save the agent first, then configure MCP servers.
        </p>
      )}

      {!modelSupportsFunctionCalling && selectedMcpServerIds.length > 0 && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Selected model does not support tools. Switch to a model with the
          &quot;Tools&quot; badge.
        </p>
      )}

      {/* Server list */}
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Loading MCP servers...
          </p>
        ) : availableServers.length === 0 ? (
          <div className="text-center py-8">
            <Plug className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No MCP servers configured
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Install from the Marketplace or add servers in Settings.
            </p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/marketplace/mcp">
                  <Store className="h-3.5 w-3.5 mr-1" />
                  Browse Marketplace
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/settings/mcp">
                  Manage Servers
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          availableServers.map((server) => {
            const isSelected = selectedMcpServerIds.includes(server.id)
            const status = getConnectionStatus(server)
            const TransportIcon = TRANSPORT_ICONS[server.transport] ?? Globe

            return (
              <button
                key={server.id}
                type="button"
                onClick={() => onToggleMcpServer(server.id)}
                disabled={isNew}
                className={cn(
                  "flex items-start gap-4 p-4 rounded-lg text-left transition-all w-full border",
                  isSelected
                    ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/50",
                  isNew && "opacity-50 cursor-not-allowed"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                    isSelected ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <DynamicIcon
                    icon={server.icon ?? undefined}
                    fallback={Plug}
                    className={cn(
                      "h-4 w-4",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}
                    emojiClassName="text-lg leading-none"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{server.name}</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      <TransportIcon className="h-2.5 w-2.5 mr-0.5" />
                      {TRANSPORT_LABELS[server.transport] ?? server.transport}
                    </Badge>
                    {server.toolCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {server.toolCount} tool
                        {server.toolCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {!server.configured ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800"
                      >
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        Needs Config
                      </Badge>
                    ) : status === "connected" ? (
                      <Wifi className="h-3 w-3 text-green-500" />
                    ) : status === "error" ? (
                      <WifiOff className="h-3 w-3 text-destructive" />
                    ) : null}
                  </div>
                  {server.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {server.description}
                    </p>
                  )}
                  {server.lastError && (
                    <p className="text-xs text-destructive mt-1 line-clamp-1">
                      {server.lastError}
                    </p>
                  )}
                </div>
                <div className="shrink-0 mt-1">
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {selectedMcpServerIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedMcpServerIds.length} server
          {selectedMcpServerIds.length !== 1 ? "s" : ""} bound
        </p>
      )}

      {/* Links to marketplace and settings */}
      <div className="flex items-center gap-3">
        <Button variant="link" size="sm" className="px-0 text-xs" asChild>
          <Link href="/dashboard/marketplace/mcp">
            <Store className="mr-1 h-3 w-3" />
            Browse Marketplace
          </Link>
        </Button>
        <Button variant="link" size="sm" className="px-0 text-xs" asChild>
          <Link href="/dashboard/settings/mcp">
            Manage MCP Servers
            <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
