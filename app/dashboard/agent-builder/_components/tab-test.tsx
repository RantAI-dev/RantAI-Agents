"use client"

import { useCallback } from "react"
import { RotateCcw, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatWorkspace } from "@/app/dashboard/_components/chat/chat-workspace"
import { useAssistantTestSessions } from "@/hooks/use-assistant-test-sessions"
import type { Assistant } from "@/lib/types/assistant"
import type { MemoryConfig } from "@/lib/types/assistant"

interface TabTestProps {
  agentId: string | null
  isNew: boolean
  /** Construct a test assistant from current form state so unsaved changes are testable */
  formAssistant: Assistant
}

export function TabTest({ agentId, isNew, formAssistant }: TabTestProps) {
  const {
    activeSession,
    activeSessionId,
    createSession,
    updateSession,
  } = useAssistantTestSessions(agentId)

  const handleReset = useCallback(() => {
    if (agentId) {
      createSession(agentId)
    }
  }, [agentId, createSession])

  const handleUpdateSession = useCallback(
    (sessionId: string, updates: { title?: string; messages?: unknown[] }) => {
      updateSession(sessionId, updates as Parameters<typeof updateSession>[1])
    },
    [updateSession]
  )

  if (isNew) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
        <h3 className="text-base font-semibold mb-1">Save Agent First</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Save the agent to test it. Tool integrations require the agent to be saved.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Test Controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <p className="text-xs text-muted-foreground">
          Testing with current saved configuration
        </p>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Reset
        </Button>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <ChatWorkspace
          key={`test-${agentId}-${activeSessionId || "new"}`}
          session={
            activeSession
              ? {
                  id: activeSession.id,
                  title: activeSession.title,
                  assistantId: activeSession.assistantId,
                  createdAt: activeSession.createdAt,
                  messages: activeSession.messages,
                }
              : undefined
          }
          assistant={formAssistant}
          onUpdateSession={handleUpdateSession}
        />
      </div>
    </div>
  )
}
