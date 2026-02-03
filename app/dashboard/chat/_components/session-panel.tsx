"use client"

import { Button } from "@/components/ui/button"
import { Plus, MessageSquare, Trash2, Pin, Database } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { ChatSession } from "../page"
import { cn } from "@/lib/utils"
import { Virtuoso } from "react-virtuoso"
import type { Assistant } from "@/lib/types/assistant"

interface SessionPanelProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
  onDeleteSession: (sessionId: string) => void
  getAssistantById: (id: string) => Assistant | undefined
}

export function SessionPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  getAssistantById,
}: SessionPanelProps) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-panel-from via-panel-via via-[61%] to-panel-to">
      {/* Header */}
      <div className="p-3 border-b border-sidebar-border">
        <Button
          onClick={onNewChat}
          className="w-full bg-sidebar-hover hover:bg-sidebar-accent text-sidebar-foreground border-0"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-hidden">
        {sessions.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare className="h-8 w-8 mx-auto text-sidebar-muted mb-2" />
            <p className="text-sm text-sidebar-foreground/70">
              No conversations yet
            </p>
            <p className="text-xs text-sidebar-muted mt-1">
              Click &quot;New Chat&quot; to start
            </p>
          </div>
        ) : (
          <Virtuoso
            data={sessions}
            className="h-full"
            itemContent={(_, session) => {
              const sessionAssistant = getAssistantById(session.assistantId)
              return (
                <div
                  className={cn(
                    "group relative flex items-start gap-3 mx-2 my-1 rounded-lg p-3 cursor-pointer transition-all duration-200",
                    activeSessionId === session.id
                      ? "bg-sidebar-accent"
                      : "hover:bg-sidebar-hover"
                  )}
                  onClick={() => onSelectSession(session.id)}
                >
                  {/* Animated ink indicator */}
                  <div
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-sm bg-sidebar-foreground",
                      "transition-all duration-150 ease-in-out",
                      activeSessionId === session.id
                        ? "h-10 opacity-100"
                        : "h-2 opacity-0 group-hover:h-6 group-hover:opacity-100"
                    )}
                  />
                  {/* Assistant Emoji */}
                  <span className="text-xl shrink-0">
                    {sessionAssistant?.emoji || "💬"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate text-sidebar-foreground">
                        {session.title}
                      </p>
                      {sessionAssistant?.useKnowledgeBase && (
                        <Database className="h-3 w-3 text-sidebar-muted shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-sidebar-muted">
                      {formatDistanceToNow(session.createdAt, { addSuffix: true })}
                    </p>
                    {session.messages.length > 0 && (
                      <p className="text-xs text-sidebar-muted truncate mt-1">
                        {session.messages[session.messages.length - 1]?.content}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Pin functionality placeholder
                      }}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-sidebar-foreground/60 hover:text-red-400 hover:bg-sidebar-hover"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSession(session.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
