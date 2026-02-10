"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Send,
  CheckCircle,
  User,
  Bot,
  Headphones,
  Copy,
  Check,
  ArrowDown,
  Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { formatDistanceToNow } from "date-fns"

interface Message {
  id: string
  role: string
  content: string
  createdAt: string
}

interface AgentWorkspaceProps {
  conversation: {
    id: string
    customerName?: string | null
    customerEmail?: string | null
    productInterest?: string | null
  } | null
  messages: Message[]
  customerTyping: boolean
  onSendMessage: (content: string) => void
  onResolve: () => void
  onBack?: () => void
}

export function AgentWorkspace({
  conversation,
  messages,
  customerTyping,
  onSendMessage,
  onResolve,
  onBack,
}: AgentWorkspaceProps) {
  const [input, setInput] = useState("")
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)

  // Auto-scroll when at bottom and new messages arrive
  useEffect(() => {
    if (atBottom && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: "LAST",
        behavior: "smooth",
      })
    }
  }, [messages, atBottom])

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: "LAST",
      behavior: "smooth",
    })
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    onSendMessage(input)
    setInput("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  if (!conversation) {
    return null
  }

  // Add typing indicator to messages if customer is typing
  const displayMessages = customerTyping
    ? [...messages, { id: "typing", role: "USER", content: "", createdAt: "" }]
    : messages

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden" aria-label="Back to queue">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <User className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {conversation.customerName || "Customer"}
            </span>
            {conversation.productInterest && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {conversation.productInterest}
              </Badge>
            )}
          </div>
          {conversation.customerEmail && (
            <p className="text-xs text-muted-foreground truncate">
              {conversation.customerEmail}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onResolve} className="gap-1.5 h-8 text-xs">
          <CheckCircle className="h-3.5 w-3.5" />
          Resolve
        </Button>
      </div>

      {/* Messages with Virtuoso */}
      <div className="flex-1 relative">
        <Virtuoso
          ref={virtuosoRef}
          data={displayMessages}
          className="h-full"
          followOutput="smooth"
          atBottomStateChange={setAtBottom}
          atBottomThreshold={100}
          overscan={200}
          itemContent={(_, message) => {
            const isAgent = message.role === "AGENT"
            const isSystem = message.role === "SYSTEM"
            const isAssistant = message.role === "ASSISTANT"
            const isTyping = message.id === "typing"

            if (isSystem) {
              return (
                <div className="flex justify-center px-4 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-1.5 px-3 bg-muted/50 rounded-full">
                    <Info className="h-3 w-3" />
                    {message.content}
                  </div>
                </div>
              )
            }

            if (isTyping) {
              return (
                <div className="max-w-3xl mx-auto px-4 py-1.5">
                  <div className="flex gap-2.5 items-end">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <User className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md py-2 px-3 text-sm bg-muted">
                      <div className="flex gap-1">
                        <span className="animate-bounce text-muted-foreground">.</span>
                        <span className="animate-bounce text-muted-foreground" style={{ animationDelay: "0.1s" }}>.</span>
                        <span className="animate-bounce text-muted-foreground" style={{ animationDelay: "0.2s" }}>.</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div className="max-w-3xl mx-auto px-4 py-1.5">
                <div
                  className={cn(
                    "group flex gap-2.5 items-end",
                    isAgent ? "flex-row-reverse" : ""
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      isAgent
                        ? "bg-primary text-primary-foreground"
                        : message.role === "USER"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-violet-100 text-violet-600"
                    )}
                  >
                    {isAgent ? (
                      <Headphones className="h-3.5 w-3.5" />
                    ) : isAssistant ? (
                      <Bot className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                  </div>

                  {/* Message bubble */}
                  <div className={cn("flex flex-col gap-0.5 max-w-[75%]", isAgent ? "items-end" : "items-start")}>
                    <span className="text-[10px] text-muted-foreground px-1">
                      {isAgent ? "You" : message.role === "USER" ? conversation.customerName || "Customer" : "AI"}
                      {message.createdAt && (
                        <> &middot; {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</>
                      )}
                    </span>
                    <div
                      className={cn(
                        "rounded-2xl py-2 px-3.5 text-sm",
                        isAgent
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : message.role === "USER"
                          ? "bg-muted rounded-bl-md"
                          : "bg-violet-50 text-violet-900 rounded-bl-md"
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    </div>
                    {/* Copy action */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopy(message.id, message.content)}
                      >
                        {copiedId === message.id ? (
                          <Check className="h-3 w-3 text-chart-2" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )
          }}
        />

        {/* Scroll to bottom button */}
        {!atBottom && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-4 right-4 rounded-full shadow-lg"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-4 bg-background">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2">
            <div className="flex-1 relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="min-h-[52px] max-h-[200px] pr-12 resize-none rounded-2xl border-2 focus-visible:ring-1"
                rows={1}
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-2 bottom-2 rounded-full h-8 w-8"
                disabled={!input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Enter to send &middot; Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  )
}
