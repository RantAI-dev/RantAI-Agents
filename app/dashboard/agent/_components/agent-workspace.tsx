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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"

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

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "USER":
        return <User className="h-5 w-5" />
      case "ASSISTANT":
        return <Bot className="h-5 w-5" />
      case "AGENT":
        return <Headphones className="h-5 w-5" />
      default:
        return null
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "USER":
        return "Customer"
      case "ASSISTANT":
        return "AI"
      case "AGENT":
        return "You"
      case "SYSTEM":
        return "System"
      default:
        return role
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
      <div className="flex items-center gap-3 p-4 border-b bg-background">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">
              {conversation.customerName || "Customer"}
            </span>
            {conversation.productInterest && (
              <Badge variant="secondary" className="text-xs">
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
        <Button variant="outline" size="sm" onClick={onResolve} className="gap-2">
          <CheckCircle className="h-4 w-4" />
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
            const isTyping = message.id === "typing"

            if (isSystem) {
              return (
                <div className="max-w-3xl mx-auto px-4 py-2">
                  <div className="text-center text-xs text-muted-foreground py-2 px-4 bg-muted/50 rounded-full inline-block">
                    {message.content}
                  </div>
                </div>
              )
            }

            if (isTyping) {
              return (
                <div className="max-w-3xl mx-auto px-4 py-3">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-xs text-muted-foreground">Customer</span>
                      <div className="rounded-lg py-2 px-3 text-sm bg-blue-100">
                        <div className="flex gap-1">
                          <span className="animate-bounce">.</span>
                          <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div className="max-w-3xl mx-auto px-4 py-3">
                <div
                  className={cn(
                    "group flex gap-3",
                    isAgent ? "flex-row-reverse" : ""
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      isAgent
                        ? "bg-primary text-primary-foreground"
                        : message.role === "USER"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-muted"
                    )}
                  >
                    {getRoleIcon(message.role)}
                  </div>
                  <div
                    className={cn(
                      "flex flex-col gap-1 min-w-0",
                      isAgent ? "items-end" : "items-start"
                    )}
                  >
                    <span className="text-xs text-muted-foreground">
                      {getRoleLabel(message.role)}
                    </span>
                    <div
                      className={cn(
                        "rounded-lg py-2 px-3 text-sm max-w-[80%]",
                        isAgent
                          ? "bg-primary text-primary-foreground"
                          : message.role === "USER"
                          ? "bg-blue-100 text-blue-900"
                          : "bg-muted"
                      )}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                    {/* Copy action */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopy(message.id, message.content)}
                      >
                        {copiedId === message.id ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
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
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="min-h-[60px] max-h-[200px] pr-12 resize-none rounded-2xl"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 bottom-2 rounded-full"
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  )
}
