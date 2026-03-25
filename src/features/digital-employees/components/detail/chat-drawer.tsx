"use client"

import { useState, useEffect, useRef } from "react"
import { MessageSquare } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ChatWorkspace } from "@/src/features/conversations/components/chat/chat-workspace"
import type { ChatSession } from "@/hooks/use-chat-sessions"
import type { Assistant } from "@/lib/types/assistant"

interface ChatDrawerProps {
  employee: {
    id: string
    name: string
    avatar: string | null
  }
  containerRunning: boolean
  syntheticSession: ChatSession | null
  employeeAssistant: Assistant
  onUpdateSession: (sessionId: string, updates: Partial<ChatSession>) => void
  /** When set, the drawer auto-opens and injects this message */
  initialMessage?: string | null
  onInitialMessageSent?: () => void
}

export function ChatDrawer({
  employee,
  containerRunning,
  syntheticSession,
  employeeAssistant,
  onUpdateSession,
  initialMessage,
  onInitialMessageSent,
}: ChatDrawerProps) {
  const [open, setOpen] = useState(false)
  const initialMessageSentRef = useRef(false)

  // Auto-open when an initial message is provided
  useEffect(() => {
    if (initialMessage && containerRunning && syntheticSession && !initialMessageSentRef.current) {
      setOpen(true)
      initialMessageSentRef.current = true
      onInitialMessageSent?.()
    }
  }, [initialMessage, containerRunning, syntheticSession, onInitialMessageSent])

  // Reset ref when initialMessage changes
  useEffect(() => {
    if (!initialMessage) {
      initialMessageSentRef.current = false
    }
  }, [initialMessage])

  if (!containerRunning || !syntheticSession) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[420px] sm:w-[480px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span>{employee.avatar || "🤖"}</span>
            Chat with {employee.name}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          <ChatWorkspace
            key={`emp-drawer-${employee.id}`}
            session={syntheticSession}
            assistant={employeeAssistant}
            apiEndpoint={`/api/dashboard/digital-employees/${employee.id}/chat`}
            onUpdateSession={onUpdateSession}
            initialMessage={initialMessage || undefined}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
