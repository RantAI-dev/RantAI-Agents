"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, Clock, Send } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ChatWorkspace } from "@/app/dashboard/_components/chat/chat-workspace"
import type { ChatSession } from "@/hooks/use-chat-sessions"
import type { Assistant } from "@/lib/types/assistant"

interface QueuedMessage {
  id: string
  content: string
  queuedAt: Date
}

interface TabChatProps {
  employee: {
    id: string
    name: string
    avatar: string | null
    status: string
    assistantId: string
    assistant: { id: string; name: string; emoji: string; model: string }
    description: string | null
  }
  containerRunning: boolean
  syntheticSession: ChatSession | null
  employeeAssistant: Assistant
  onUpdateSession: (sessionId: string, updates: Partial<ChatSession>) => void
}

export function TabChat({
  employee,
  containerRunning,
  syntheticSession,
  employeeAssistant,
  onUpdateSession,
}: TabChatProps) {
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([])
  const [offlineInput, setOfflineInput] = useState("")
  const prevContainerRunning = useRef(containerRunning)

  // Auto-send queued messages when container comes online
  useEffect(() => {
    if (containerRunning && !prevContainerRunning.current && queuedMessages.length > 0) {
      // Container just came online - send queued messages via the chat API
      for (const msg of queuedMessages) {
        fetch(`/api/dashboard/digital-employees/${employee.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: msg.content }],
          }),
        }).catch(() => {})
      }
      setQueuedMessages([])
    }
    prevContainerRunning.current = containerRunning
  }, [containerRunning, queuedMessages, employee.id])

  const handleQueueMessage = useCallback(() => {
    if (!offlineInput.trim()) return
    setQueuedMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), content: offlineInput.trim(), queuedAt: new Date() },
    ])
    setOfflineInput("")
  }, [offlineInput])

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {!containerRunning ? (
        <div className="flex-1 flex flex-col">
          {/* Offline message area */}
          <div className="flex-1 overflow-auto p-5">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="text-4xl mb-3">{employee.avatar || "🤖"}</div>
              <h3 className="text-lg font-medium mb-1">{employee.name} is offline</h3>
              <p className="text-sm text-muted-foreground max-w-sm text-center mb-4">
                {employee.status === "ACTIVE"
                  ? "Start the employee to begin chatting. You can queue messages below."
                  : employee.status === "DRAFT"
                    ? "Deploy the employee first to start chatting."
                    : "Resume or redeploy to chat."}
              </p>
            </div>

            {/* Show queued messages */}
            {queuedMessages.length > 0 && (
              <div className="space-y-2 max-w-lg mx-auto">
                {queuedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-dashed"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{msg.content}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      <Clock className="h-3 w-3 mr-1" />
                      Queued
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Read-only history */}
            {syntheticSession && syntheticSession.messages.length > 0 && (
              <div className="mt-6 max-w-lg mx-auto">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Previous messages
                </h4>
                <div className="space-y-2 opacity-60">
                  {syntheticSession.messages.slice(-10).map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-2 rounded-lg text-sm ${
                        msg.role === "user" ? "bg-primary/5 ml-8" : "bg-muted mr-8"
                      }`}
                    >
                      <p className="line-clamp-3">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Offline input bar */}
          {employee.status === "ACTIVE" && (
            <div className="border-t px-4 py-3">
              <form
                className="flex items-center gap-2 max-w-lg mx-auto"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleQueueMessage()
                }}
              >
                <Input
                  value={offlineInput}
                  onChange={(e) => setOfflineInput(e.target.value)}
                  placeholder="Type a message to queue..."
                  className="flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!offlineInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground text-center mt-1">
                Messages will be sent when the employee comes online
              </p>
            </div>
          )}
        </div>
      ) : syntheticSession ? (
        <ChatWorkspace
          key={`emp-${employee.id}`}
          session={syntheticSession}
          assistant={employeeAssistant}
          apiEndpoint={`/api/dashboard/digital-employees/${employee.id}/chat`}
          onUpdateSession={onUpdateSession}
        />
      ) : (
        <div className="flex-1 h-full flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
