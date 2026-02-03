"use client"

import { MessageSquare, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  onNewChat?: () => void
}

export function EmptyState({ onNewChat }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="rounded-full bg-muted p-4 mb-4">
        <MessageSquare className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Welcome to Chat</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Start a conversation with the AI assistant. Ask questions
        about products, services, and more.
      </p>
      {onNewChat && (
        <Button onClick={onNewChat}>
          <Plus className="h-4 w-4 mr-2" />
          Start New Chat
        </Button>
      )}
    </div>
  )
}
