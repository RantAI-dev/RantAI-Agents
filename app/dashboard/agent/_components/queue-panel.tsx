"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Clock, User, Package, Headphones } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { QueueConversation } from "@/types/socket"
import { Virtuoso } from "react-virtuoso"

interface QueuePanelProps {
  queue: QueueConversation[]
  isOnline: boolean
  isConnected: boolean
  onGoOnline: () => void
  onGoOffline: () => void
  onAcceptConversation: (conversationId: string) => void
}

export function QueuePanel({
  queue,
  isOnline,
  isConnected,
  onGoOnline,
  onGoOffline,
  onAcceptConversation,
}: QueuePanelProps) {
  const handleToggle = () => {
    if (isOnline) {
      onGoOffline()
    } else {
      onGoOnline()
    }
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-panel-from via-panel-via via-[61%] to-panel-to">
      {/* Status Toggle */}
      <div className="p-4 border-b border-sidebar-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                isOnline ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" : "bg-sidebar-muted"
              }`}
            />
            <Label htmlFor="online-toggle" className="text-sm font-medium text-sidebar-foreground">
              {isOnline ? "Online" : "Offline"}
            </Label>
          </div>
          <Switch
            id="online-toggle"
            checked={isOnline}
            onCheckedChange={handleToggle}
            disabled={!isConnected}
            className="data-[state=checked]:bg-green-500"
          />
        </div>
        {!isConnected && (
          <p className="text-xs text-sidebar-muted">
            Connecting to server...
          </p>
        )}
      </div>

      {/* Queue Header */}
      <div className="px-4 py-2 border-b border-sidebar-border flex items-center justify-between">
        <span className="text-sm font-medium text-sidebar-foreground/70">Queue</span>
        {queue.length > 0 && (
          <Badge className="bg-sidebar-hover text-sidebar-foreground text-xs hover:bg-sidebar-accent">
            {queue.length}
          </Badge>
        )}
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-hidden">
        {!isOnline ? (
          <div className="text-center py-8 px-4">
            <Headphones className="h-10 w-10 mx-auto text-sidebar-muted mb-2" />
            <p className="text-sm text-sidebar-foreground/70">
              You&apos;re offline
            </p>
            <p className="text-xs text-sidebar-muted mt-1">
              Go online to receive customer requests
            </p>
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Clock className="h-10 w-10 mx-auto text-sidebar-muted mb-2" />
            <p className="text-sm text-sidebar-foreground/70">Queue is empty</p>
            <p className="text-xs text-sidebar-muted mt-1">
              Waiting for customer requests...
            </p>
          </div>
        ) : (
          <Virtuoso
            data={queue}
            className="h-full"
            itemContent={(_, conversation) => (
              <div className="px-2 py-1">
                <div className="rounded-lg bg-sidebar-hover hover:bg-sidebar-accent transition-colors p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-sidebar-foreground/60" />
                      <span className="font-medium text-sm text-sidebar-foreground">
                        {conversation.customerName || "Anonymous"}
                      </span>
                    </div>
                    <Badge className="bg-sidebar-accent text-sidebar-foreground/80 text-xs">
                      {conversation.channel || "PORTAL"}
                    </Badge>
                  </div>

                  {conversation.customerEmail && (
                    <p className="text-xs text-sidebar-muted truncate">
                      {conversation.customerEmail}
                    </p>
                  )}

                  {conversation.productInterest && (
                    <div className="flex items-center gap-1 text-xs text-sidebar-foreground/60">
                      <Package className="h-3 w-3" />
                      <span>{conversation.productInterest}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-xs text-sidebar-muted">
                    <Clock className="h-3 w-3" />
                    <span>
                      {conversation.handoffAt
                        ? formatDistanceToNow(new Date(conversation.handoffAt), {
                            addSuffix: true,
                          })
                        : "Just now"}
                    </span>
                  </div>

                  {conversation.messagePreview && (
                    <p className="text-xs text-sidebar-muted line-clamp-2 italic">
                      &quot;{conversation.messagePreview}&quot;
                    </p>
                  )}

                  <Button
                    size="sm"
                    className="w-full mt-2 bg-sidebar-accent hover:bg-sidebar-hover text-sidebar-foreground border-0"
                    onClick={() => onAcceptConversation(conversation.id)}
                  >
                    Accept
                  </Button>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  )
}
